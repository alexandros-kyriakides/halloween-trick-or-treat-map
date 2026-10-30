import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, type EntryFields, type Pin, type PinList } from './api';
import { LIMITS, REFRESH_MS } from './config';
import { groupPins, insideArea, nearestGroup, type LatLng, type PinGroup } from './geo';
import { dict, errorText, type Lang, type T } from './i18n';
import { MapView, type BaseLayer, type MapHandle } from './MapView';
import { GoogleMapView } from './GoogleMapView';

// Set in Amplify (Hosting -> Environment variables -> VITE_GOOGLE_MAPS_API_KEY). Without it, or if
// Google rejects the key, the site uses the Esri/Leaflet maps instead.
const GOOGLE_MAPS_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() ?? '';

// ---------- small persistence helpers (browser storage can be unavailable; never fatal) ----------

function load<V>(key: string, fallback: V): V {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as V);
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

type Fields = { apartment: string; names: string; buzzer: string; notes: string };
const emptyFields: Fields = { apartment: '', names: '', buzzer: '', notes: '' };
const fromPin = (p: Pin): Fields => ({
  apartment: p.apartment ?? '',
  names: p.names ?? '',
  buzzer: p.buzzer ?? '',
  notes: p.notes ?? '',
});
const toEntry = (f: Fields, at: LatLng): EntryFields => ({
  lat: at.lat,
  lng: at.lng,
  apartment: f.apartment.trim() || null,
  names: f.names.trim() || null,
  buzzer: f.buzzer.trim() || null,
  notes: f.notes.trim() || null,
});

type Sheet =
  | { kind: 'group'; key: string }
  | { kind: 'groupCode'; thenAdd: boolean }
  | { kind: 'form'; mode: 'new'; at: LatLng; fields: Fields }
  | { kind: 'form'; mode: 'edit'; id: string; code: string; at: LatLng; fields: Fields; ownerCode?: string }
  | { kind: 'code'; id: string; code: string }
  | { kind: 'askCode'; id: string; error?: string };

type Placing = {
  draft: LatLng | null;
  edit?: { id: string; code: string; fields: Fields };
};

const initialLang = (): Lang => load<Lang | null>('hm.lang', null) ?? (navigator.language?.startsWith('el') ? 'el' : 'en');

export default function App() {
  const [lang, setLang] = useState<Lang>(initialLang);
  const t = dict[lang];
  const [groupCode, setGroupCode] = useState<string | null>(() => load('hm.groupCode', null));
  const [list, setList] = useState<PinList | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [myCodes, setMyCodes] = useState<Record<string, string>>(() => load('hm.codes', {}));
  // Superuser (admin) code, remembered on this device after it first works.
  const [superCode, setSuperCode] = useState<string | null>(() => load('hm.super', null));
  const rememberSuper = useCallback((code: string | null) => {
    setSuperCode(code);
    save('hm.super', code);
  }, []);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [placing, setPlacing] = useState<Placing | null>(null);
  const [sameBuilding, setSameBuilding] = useState(true);
  const [userPos, setUserPos] = useState<LatLng | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);
  const [tracking, setTracking] = useState(false);
  const [baseLayer, setBaseLayer] = useState<BaseLayer>(() => load<BaseLayer>('hm.base', 'satellite'));
  useEffect(() => save('hm.base', baseLayer), [baseLayer]);
  const mapRef = useRef<MapHandle | null>(null);
  const [googleFailed, setGoogleFailed] = useState(false);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = t.title;
    save('hm.lang', lang);
  }, [lang, t.title]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 3800);
  }, []);

  const rememberCode = useCallback((id: string, code: string | null) => {
    setMyCodes((prev) => {
      const next = { ...prev };
      if (code) next[id] = code;
      else delete next[id];
      save('hm.codes', next);
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await api.listPins(groupCode);
      if (groupCode && !res.groupCodeOk && !res.closed) {
        // The stored code no longer works (e.g. it was changed). Forget it.
        setGroupCode(null);
        save('hm.groupCode', null);
      }
      setList(res);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [groupCode]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const groups = useMemo(() => groupPins(list?.pins ?? []), [list]);
  const unlocked = !!list?.groupCodeOk;
  const closed = !!list?.closed;

  // ---------- editing ----------

  const openEdit = useCallback(
    async (id: string, code: string, from: 'typed' | 'stored' | 'super') => {
      try {
        const pin = await api.getEntryForEdit(id, code);
        if (pin.superuser) {
          rememberSuper(code);
        } else {
          rememberCode(id, code);
        }
        setSheet({
          kind: 'form',
          mode: 'edit',
          id,
          code,
          at: { lat: pin.lat, lng: pin.lng },
          fields: fromPin(pin),
          ownerCode: pin.superuser ? (pin.editCode ?? undefined) : undefined,
        });
      } catch (e) {
        const type = (e as ApiError).type;
        if (type === 'NOT_FOUND') {
          rememberCode(id, null);
          setSheet(null);
          showToast(errorText(t, e));
          refresh();
        } else if (from !== 'typed' && type === 'WRONG_CODE') {
          // A remembered code stopped working (changed): forget it and ask.
          if (from === 'super') rememberSuper(null);
          else rememberCode(id, null);
          setSheet({ kind: 'askCode', id });
        } else {
          setSheet({ kind: 'askCode', id, error: errorText(t, e) });
        }
      }
    },
    [rememberCode, rememberSuper, refresh, showToast, t],
  );

  // Edit links look like  https://site/#edit=<id>&code=<CODE>  (the part after # never reaches a server)
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const id = params.get('edit');
    const code = params.get('code');
    if (id && code) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
      openEdit(id, code, 'typed');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startEdit = (id: string) => {
    const stored = myCodes[id];
    if (stored) openEdit(id, stored, 'stored');
    else if (superCode) openEdit(id, superCode, 'super');
    else setSheet({ kind: 'askCode', id });
  };

  // ---------- adding / placing ----------

  const startAdd = () => {
    if (!unlocked) {
      setSheet({ kind: 'groupCode', thenAdd: true });
      return;
    }
    setSheet(null);
    setSameBuilding(true);
    setPlacing({ draft: null });
  };

  const onMapTap = (p: LatLng) => {
    if (!placing) {
      setSheet((s) => (s?.kind === 'group' ? null : s));
      return;
    }
    if (!insideArea(p)) {
      showToast(t.placeOutside);
      return;
    }
    setPlacing({ ...placing, draft: p });
  };

  const nearby = placing?.draft ? nearestGroup(groups, placing.draft, placing.edit?.id) : undefined;

  const finishPlacing = () => {
    if (!placing?.draft) return;
    const at = nearby && sameBuilding ? { lat: nearby.lat, lng: nearby.lng } : placing.draft;
    if (placing.edit) {
      setSheet({ kind: 'form', mode: 'edit', id: placing.edit.id, code: placing.edit.code, at, fields: placing.edit.fields });
    } else {
      setSheet({ kind: 'form', mode: 'new', at, fields: emptyFields });
    }
    setPlacing(null);
  };

  const cancelPlacing = () => {
    if (placing?.edit) {
      const { id, code } = placing.edit;
      setPlacing(null);
      openEdit(id, code, 'stored');
    } else {
      setPlacing(null);
    }
  };

  // ---------- location ----------

  const locate = (forPlacing: boolean) => {
    if (!('geolocation' in navigator)) {
      showToast(t.locationOff);
      return;
    }
    const onFix = (pos: GeolocationPosition) => {
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setUserPos(p);
      return p;
    };
    if (forPlacing) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const p = onFix(pos);
          if (!insideArea(p)) return showToast(t.locationOutside);
          setPlacing((cur) => (cur ? { ...cur, draft: p } : cur));
          mapRef.current?.focus(p, 18);
        },
        () => showToast(t.locationOff),
        { enableHighAccuracy: true, timeout: 15000 },
      );
      return;
    }
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
      setTracking(false);
      setUserPos(null);
      return;
    }
    setTracking(true);
    let first = true;
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const p = onFix(pos);
        if (first) {
          first = false;
          if (insideArea(p)) mapRef.current?.focus(p, 17);
          else showToast(t.locationOutside);
        }
      },
      () => {
        if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
        setTracking(false);
        setUserPos(null);
        showToast(t.locationOff);
      },
      { enableHighAccuracy: true, maximumAge: 10000 },
    );
  };

  // ---------- render ----------

  const selectedGroup = sheet?.kind === 'group' ? groups.find((g) => g.key === sheet.key) : undefined;
  useEffect(() => {
    if (sheet?.kind === 'group' && !selectedGroup) setSheet(null);
  }, [sheet, selectedGroup]);

  return (
    <div className="app">
      <header className="bar">
        <div className="bar-text">
          <h1>{t.title}</h1>
          <p>{t.when}</p>
        </div>
        {superCode && (
          <button className="admin-chip" onClick={() => rememberSuper(null)} title={t.adminExit}>
            {t.admin} ✕
          </button>
        )}
        <button className="lang" onClick={() => setLang(lang === 'en' ? 'el' : 'en')} aria-label={t.switchLabel}>
          {t.switchTo}
        </button>
      </header>

      {!unlocked && !closed && list && (
        <div className="banner">
          <p>{t.bannerText}</p>
          <button className="btn btn-small" onClick={() => setSheet({ kind: 'groupCode', thenAdd: false })}>
            {t.bannerButton}
          </button>
        </div>
      )}

      <main className="map-area">
        <div className="layer-switch" role="group" aria-label={t.mapView}>
          <button aria-pressed={baseLayer === 'satellite'} onClick={() => setBaseLayer('satellite')}>
            {t.satellite}
          </button>
          <button aria-pressed={baseLayer === 'map'} onClick={() => setBaseLayer('map')}>
            {t.streetMap}
          </button>
        </div>

        {(() => {
          const mapProps = {
            baseLayer,
            groups: closed ? [] : groups,
            selectedKey: selectedGroup?.key ?? null,
            draft: placing?.draft ?? null,
            userPos,
            placing: !!placing,
            onGroupTap: (g: PinGroup) => setSheet({ kind: 'group', key: g.key }),
            onMapTap,
            onDraftMove: (p: LatLng) =>
              insideArea(p) ? setPlacing((c) => (c ? { ...c, draft: p } : c)) : showToast(t.placeOutside),
            mapRef,
          };
          // The map language is fixed when Google loads, so a language switch remounts it.
          return GOOGLE_MAPS_KEY && !googleFailed ? (
            <GoogleMapView
              key={`google-${lang}`}
              apiKey={GOOGLE_MAPS_KEY}
              language={lang}
              onFail={() => setGoogleFailed(true)}
              {...mapProps}
            />
          ) : (
            <MapView {...mapProps} />
          );
        })()}

        {closed && <div className="notice notice-closed">{t.closed}</div>}
        {loadError && !list && (
          <div className="notice">
            <p>{t.loadFailed}</p>
            <button className="btn" onClick={refresh}>
              {t.retry}
            </button>
          </div>
        )}
        {unlocked && !closed && groups.length === 0 && !placing && !sheet && <div className="notice notice-soft">{t.emptyMap}</div>}

        {!placing && !closed && (
          <div className="controls">
            <button
              className={`round${tracking ? ' round-on' : ''}`}
              onClick={() => locate(false)}
              aria-label={t.myLocation}
              aria-pressed={tracking}
            >
              <LocateIcon />
            </button>
            {list && (
              <button className="btn btn-primary btn-add" onClick={startAdd}>
                {t.addHome}
              </button>
            )}
          </div>
        )}

        {placing && (
          <div className="placing" role="region" aria-label={t.addHome}>
            <p className="placing-text">{placing.draft ? t.placeDrag : t.placeTap}</p>
            {nearby && (
              <label className="check">
                <input type="checkbox" checked={sameBuilding} onChange={(e) => setSameBuilding(e.target.checked)} />
                <span>{t.sameBuilding}</span>
              </label>
            )}
            <div className="row">
              <button className="btn" onClick={cancelPlacing}>
                {t.cancel}
              </button>
              <button className="btn" onClick={() => locate(true)}>
                {t.useMyLocation}
              </button>
              <button className="btn btn-primary" disabled={!placing.draft} onClick={finishPlacing}>
                {t.next}
              </button>
            </div>
          </div>
        )}
      </main>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      {sheet && (
        <SheetFrame onClose={() => setSheet(null)} t={t}>
          {sheet.kind === 'group' && selectedGroup && (
            <GroupSheet t={t} group={selectedGroup} unlocked={unlocked} myCodes={myCodes} onEdit={startEdit} onUnlock={() => setSheet({ kind: 'groupCode', thenAdd: false })} />
          )}
          {sheet.kind === 'groupCode' && (
            <GroupCodeSheet
              t={t}
              onDone={async (code) => {
                const res = await api.listPins(code);
                if (!res.groupCodeOk) return t.groupCodeWrong;
                setGroupCode(code);
                save('hm.groupCode', code);
                setList(res);
                if (sheet.thenAdd) {
                  setSheet(null);
                  setSameBuilding(true);
                  setPlacing({ draft: null });
                } else setSheet(null);
                return null;
              }}
            />
          )}
          {sheet.kind === 'askCode' && <AskCodeSheet t={t} error={sheet.error} onSubmit={(code) => openEdit(sheet.id, code, 'typed')} />}
          {sheet.kind === 'form' && (
            <FormSheet
              key={sheet.mode === 'edit' ? sheet.id : 'new'}
              t={t}
              sheet={sheet}
              onMove={(fields) => {
                if (sheet.mode !== 'edit') return;
                setSheet(null);
                setSameBuilding(false);
                setPlacing({ draft: sheet.at, edit: { id: sheet.id, code: sheet.code, fields } });
              }}
              onSave={async (fields) => {
                if (sheet.mode === 'new') {
                  const res = await api.createEntry(groupCode ?? '', toEntry(fields, sheet.at));
                  rememberCode(res.id, res.editCode);
                  setSheet({ kind: 'code', id: res.id, code: res.editCode });
                  showToast(t.added);
                } else {
                  await api.updateEntry(sheet.id, sheet.code, toEntry(fields, sheet.at));
                  setSheet(null);
                  showToast(t.saved);
                }
                refresh();
              }}
              onRemove={async () => {
                if (sheet.mode !== 'edit') return;
                await api.deleteEntry(sheet.id, sheet.code);
                const removedId = sheet.id;
                setList((cur) => (cur ? { ...cur, pins: cur.pins.filter((p) => p.id !== removedId) } : cur));
                rememberCode(sheet.id, null);
                setSheet(null);
                showToast(t.removed);
                refresh();
              }}
            />
          )}
          {sheet.kind === 'code' && <CodeSheet t={t} id={sheet.id} code={sheet.code} onDone={() => setSheet(null)} showToast={showToast} />}
        </SheetFrame>
      )}
    </div>
  );
}

// ---------- sheets ----------

function SheetFrame({ children, onClose, t }: { children: React.ReactNode; onClose: () => void; t: T }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet" role="dialog" aria-modal="false">
      <button className="sheet-close" onClick={onClose} aria-label={t.close}>
        <CloseIcon />
      </button>
      {children}
    </div>
  );
}

function GroupSheet(props: {
  t: T;
  group: PinGroup;
  unlocked: boolean;
  myCodes: Record<string, string>;
  onEdit: (id: string) => void;
  onUnlock: () => void;
}) {
  const { t, group } = props;
  return (
    <>
      <h2>{t.homesHere(group.pins.length)}</h2>
      {!props.unlocked ? (
        <>
          <p className="muted">{t.detailsLocked}</p>
          <button className="btn btn-primary" onClick={props.onUnlock}>
            {t.bannerButton}
          </button>
        </>
      ) : (
        <ul className="entries">
          {group.pins.map((p) => (
            <li key={p.id} className="entry">
              <div className="entry-main">
                <p className="entry-names">
                  {p.names || '🎃'}
                  {props.myCodes[p.id] && <span className="tag">{t.yours}</span>}
                </p>
                {p.apartment && (
                  <p>
                    <span className="k">{t.apartmentShort}</span> {p.apartment}
                  </p>
                )}
                {p.buzzer && (
                  <p>
                    <span className="k">{t.ringShort}</span> {p.buzzer}
                  </p>
                )}
                {p.notes && <p className="entry-notes">{p.notes}</p>}
              </div>
              <button className="btn btn-small btn-ghost" onClick={() => props.onEdit(p.id)}>
                {t.edit}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function useBusy() {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  return [busy, run] as const;
}

function GroupCodeSheet({ t, onDone }: { t: T; onDone: (code: string) => Promise<string | null> }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, run] = useBusy();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          try {
            setError(await onDone(code.trim()));
          } catch (err) {
            setError(errorText(t, err));
          }
        });
      }}
    >
      <h2>{t.groupCodeTitle}</h2>
      <p className="muted">{t.groupCodeHelp}</p>
      <input
        className="input input-code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        autoFocus
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        aria-label={t.groupCodeTitle}
        aria-invalid={!!error}
      />
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primary btn-wide" disabled={!code.trim() || busy}>
        {t.groupCodeContinue}
      </button>
    </form>
  );
}

function AskCodeSheet({ t, error, onSubmit }: { t: T; error?: string; onSubmit: (code: string) => Promise<void> }) {
  const [code, setCode] = useState('');
  const [busy, run] = useBusy();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => onSubmit(code.trim()));
      }}
    >
      <h2>{t.askCodeTitle}</h2>
      <p className="muted">{t.askCodeHelp}</p>
      <input
        className="input input-code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        autoFocus
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        aria-label={t.askCodeLabel}
        aria-invalid={!!error}
      />
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primary btn-wide" disabled={!code.trim() || busy}>
        {t.askCodeContinue}
      </button>
    </form>
  );
}

function FormSheet(props: {
  t: T;
  sheet: Extract<Sheet, { kind: 'form' }>;
  onSave: (f: Fields) => Promise<void>;
  onMove: (f: Fields) => void;
  onRemove: () => Promise<void>;
}) {
  const { t, sheet } = props;
  const [f, setF] = useState<Fields>(sheet.fields);
  const [consent, setConsent] = useState(sheet.mode === 'edit');
  // In-page confirmation: window.confirm() can be silently suppressed in in-app browsers (Viber).
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, run] = useBusy();
  const attempt = (fn: () => Promise<void>) =>
    run(async () => {
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError(errorText(t, e));
      }
    });

  const field = (name: keyof Fields, label: string, hint: string, multiline = false) => (
    <label className="field">
      <span className="field-label">
        {label} <span className="muted">({t.optional})</span>
      </span>
      {multiline ? (
        <textarea className="input" rows={2} maxLength={LIMITS[name]} placeholder={hint} value={f[name]} onChange={(e) => setF({ ...f, [name]: e.target.value })} />
      ) : (
        <input className="input" maxLength={LIMITS[name]} placeholder={hint} value={f[name]} onChange={(e) => setF({ ...f, [name]: e.target.value })} />
      )}
    </label>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        attempt(() => props.onSave(f));
      }}
    >
      <h2>{sheet.mode === 'new' ? t.formNew : sheet.ownerCode ? t.formEditAdmin : t.formEdit}</h2>
      {sheet.mode === 'edit' && sheet.ownerCode && (
        <p className="admin-note">
          {t.adminOwnerCode} <strong className="owner-code">{sheet.ownerCode}</strong>
        </p>
      )}
      {field('names', t.names, t.namesHint)}
      {field('apartment', t.apartment, t.apartmentHint)}
      {field('buzzer', t.buzzer, t.buzzerHint)}
      {field('notes', t.notes, t.notesHint, true)}
      {sheet.mode === 'new' && (
        <label className="check check-consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>{t.consent}</span>
        </label>
      )}
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primary btn-wide" disabled={busy || !consent}>
        {sheet.mode === 'new' ? t.addToMap : t.saveChanges}
      </button>
      {sheet.mode === 'edit' && !confirmingRemove && (
        <div className="row row-split">
          <button type="button" className="btn btn-ghost" onClick={() => props.onMove(f)} disabled={busy}>
            {t.movePin}
          </button>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={() => setConfirmingRemove(true)}>
            {sheet.ownerCode ? t.removeAdmin : t.remove}
          </button>
        </div>
      )}
      {sheet.mode === 'edit' && confirmingRemove && (
        <div className="confirm" role="alertdialog" aria-label={t.removeConfirm}>
          <p>{sheet.ownerCode ? t.removeConfirmAdmin : t.removeConfirm}</p>
          <div className="row">
            <button type="button" className="btn" disabled={busy} onClick={() => setConfirmingRemove(false)}>
              {t.cancel}
            </button>
            <button type="button" className="btn btn-danger-solid" disabled={busy} onClick={() => attempt(props.onRemove)}>
              {t.removeYes}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

function CodeSheet({ t, id, code, onDone, showToast }: { t: T; id: string; code: string; onDone: () => void; showToast: (m: string) => void }) {
  const link = `${window.location.origin}/#edit=${encodeURIComponent(id)}&code=${encodeURIComponent(code)}`;
  const text = t.shareText(code, link);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      showToast(t.copied);
    } catch {
      // Clipboard can be blocked in in-app browsers: select the code so it can be copied by hand.
      const el = document.querySelector('.code');
      const sel = window.getSelection();
      if (el && sel) {
        const range = document.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      showToast(t.copyManual);
    }
  };
  return (
    <>
      <h2>{t.codeTitle}</h2>
      <p className="code" aria-live="polite">
        {code}
      </p>
      <p className="muted">{t.codeHelp}</p>
      <div className="stack">
        <button className="btn" onClick={copy}>
          {t.copyCode}
        </button>
        <a className="btn btn-viber" href={`viber://forward?text=${encodeURIComponent(text)}`}>
          {t.viber}
        </a>
        {'share' in navigator && (
          <button className="btn" onClick={() => navigator.share({ text }).catch(() => undefined)}>
            {t.share}
          </button>
        )}
        <button className="btn btn-primary" onClick={onDone}>
          {t.done}
        </button>
      </div>
    </>
  );
}

// ---------- icons ----------

function LocateIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 1v4M12 19v4M1 12h4M19 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
