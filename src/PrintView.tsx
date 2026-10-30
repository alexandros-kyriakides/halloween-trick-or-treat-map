import { useMemo, useState } from 'react';
import { BOUNDS, CENTER } from './config';
import type { PinGroup } from './geo';
import type { BaseLayer } from './MapView';
import type { T } from './i18n';
import { detectPlatform } from './locationHelp';

// A printable page: one map image zoomed to the participating homes, with numbered markers, and a numbered
// list of the homes. The map image comes from Google's Maps Static API when a Google key is
// set (it must have "Maps Static API" enabled), otherwise, or if that fails, from Esri.

type Tile = { url: string; x: number; y: number; w: number; h: number };
type View = { tiles: Tile[]; west: number; east: number; north: number; south: number; w: number; h: number };

const SIZE = 640; // CSS pixels of the map (Google's single-image maximum); requested at 2x
const MARGIN = 50; // CSS pixels kept free around the outermost homes

function mercY(lat: number) {
  const r = (lat * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + r / 2));
}
function latFromMercY(y: number) {
  return ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;
}

type Frame = { lat: number; lng: number; zoom: number; west: number; east: number; north: number; south: number };

/**
 * The square map frame: zoomed so all homes fit with a margin, centred on them.
 * Whole zoom levels (Google needs them), between 15 (the whole area) and 18 (street level).
 * With no homes, the whole 1.5 km area.
 */
export function fitFrame(groups: { lat: number; lng: number }[]): Frame {
  let lng = CENTER[1];
  let my = mercY(CENTER[0]);
  let zoom = 15;
  if (groups.length > 0) {
    const lngs = groups.map((g) => g.lng);
    const ys = groups.map((g) => mercY(g.lat));
    const [w, e] = [Math.min(...lngs), Math.max(...lngs)];
    const [s, n] = [Math.min(...ys), Math.max(...ys)];
    lng = (w + e) / 2;
    my = (s + n) / 2;
    // Map size in world pixels at zoom 0: 256 for 360 degrees / 2*pi of Mercator y.
    const spanAt0 = Math.max(((e - w) / 360) * 256, ((n - s) / (2 * Math.PI)) * 256, 1e-9);
    zoom = Math.max(15, Math.min(18, Math.floor(Math.log2((SIZE - 2 * MARGIN) / spanAt0))));
  }
  const worldPx = 256 * 2 ** zoom;
  const half = SIZE / 2;
  return {
    lat: latFromMercY(my),
    lng,
    zoom,
    west: lng - half * (360 / worldPx),
    east: lng + half * (360 / worldPx),
    north: latFromMercY(my + half * ((2 * Math.PI) / worldPx)),
    south: latFromMercY(my - half * ((2 * Math.PI) / worldPx)),
  };
}

function googleView(f: Frame, key: string, base: BaseLayer, lang: string): View {
  const url =
    'https://maps.googleapis.com/maps/api/staticmap?' +
    new URLSearchParams({
      center: `${f.lat.toFixed(7)},${f.lng.toFixed(7)}`,
      zoom: String(f.zoom),
      size: `${SIZE}x${SIZE}`,
      scale: '2',
      maptype: base === 'satellite' ? 'hybrid' : 'roadmap',
      language: lang,
      key,
    }).toString();
  return { tiles: [{ url, x: 0, y: 0, w: SIZE, h: SIZE }], ...f, w: SIZE, h: SIZE };
}

function esriView(f: Frame, base: BaseLayer): View {
  const service = base === 'satellite' ? 'World_Imagery' : 'World_Street_Map';
  const url =
    `https://server.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/export?` +
    new URLSearchParams({
      bbox: `${f.west},${f.south},${f.east},${f.north}`,
      bboxSR: '4326',
      imageSR: '3857',
      size: `${SIZE * 2},${SIZE * 2}`,
      format: 'jpg',
      f: 'image',
    }).toString();
  return { tiles: [{ url, x: 0, y: 0, w: SIZE, h: SIZE }], ...f, w: SIZE, h: SIZE };
}

function project(v: View, lat: number, lng: number) {
  return {
    x: ((lng - v.west) / (v.east - v.west)) * v.w,
    y: ((mercY(v.north) - mercY(lat)) / (mercY(v.north) - mercY(v.south))) * v.h,
  };
}

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

/** Groups in reading order (north to south, then west to east), numbered from 1. */
export function numberGroups(groups: PinGroup[]) {
  return [...groups].sort((a, b) => b.lat - a.lat || a.lng - b.lng).map((g, i) => ({ n: i + 1, g }));
}

export function PrintView(props: {
  t: T;
  lang: string;
  groups: PinGroup[];
  baseLayer: BaseLayer;
  googleKey: string;
  onClose: () => void;
  showToast: (m: string) => void;
}) {
  const { t } = props;
  const [useEsri, setUseEsri] = useState(!props.googleKey);
  const frame = useMemo(() => fitFrame(props.groups), [props.groups]);
  const view = useMemo(
    () => (useEsri ? esriView(frame, props.baseLayer) : googleView(frame, props.googleKey, props.baseLayer, props.lang)),
    [useEsri, frame, props.baseLayer, props.googleKey, props.lang],
  );
  const numbered = useMemo(() => numberGroups(props.groups), [props.groups]);
  const hasNotes = props.groups.some((g) => g.pins.some((p) => p.notes));
  const box = { a: project(view, BOUNDS.north, BOUNDS.west), b: project(view, BOUNDS.south, BOUNDS.east) };
  const printedAt = new Date().toLocaleString(props.lang === 'el' ? 'el-GR' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const saveImage = async () => {
    // Draw the map and the numbered markers into one picture. This needs the map server to
    // allow it (CORS); if it doesn't, suggest a screenshot instead.
    try {
      const images = await Promise.all(
        view.tiles.map(async (tile) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = tile.url;
          await img.decode();
          return { img, tile };
        }),
      );
      const s = 2;
      const canvas = document.createElement('canvas');
      canvas.width = view.w * s;
      canvas.height = view.h * s;
      const c = canvas.getContext('2d')!;
      for (const { img, tile } of images) c.drawImage(img, tile.x * s, tile.y * s, tile.w * s, tile.h * s);
      if (numbered.length === 0) {
        c.strokeStyle = '#FF8A1F';
        c.lineWidth = 3 * s;
        c.strokeRect(box.a.x * s, box.a.y * s, (box.b.x - box.a.x) * s, (box.b.y - box.a.y) * s);
      }
      for (const { n, g } of numbered) {
        const p = project(view, g.lat, g.lng);
        c.beginPath();
        c.arc(p.x * s, p.y * s, 13 * s, 0, Math.PI * 2);
        c.fillStyle = '#FF8A1F';
        c.fill();
        c.lineWidth = 2 * s;
        c.strokeStyle = '#3B1F4A';
        c.stroke();
        c.fillStyle = '#3B1F4A';
        c.font = `bold ${14 * s}px Arial`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(String(n), p.x * s, p.y * s + s);
      }
      const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('blob'))), 'image/png'));
      const file = new File([blob], 'trick-or-treat-map.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: t.title });
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') props.showToast(t.printImageFailed);
    }
  };

  return (
    <div className="print-view" role="dialog" aria-label={t.printTitle}>
      <div className="print-actions no-print">
        <button className="btn btn-primary" onClick={() => window.print()}>
          {t.printPrint}
        </button>
        <button className="btn" onClick={saveImage}>
          {t.printSaveImage}
        </button>
        <button className="btn btn-ghost" onClick={props.onClose}>
          {t.close}
        </button>
        {detectPlatform().endsWith('viber') && <p className="print-hint">{t.printViberHint}</p>}
      </div>

      <div className="print-page">
        <h1>{t.title}</h1>
        <p className="print-when">
          {t.when} · {t.printUpdated} {printedAt}
        </p>

        <div className="print-map" style={{ maxWidth: view.w, aspectRatio: `${view.w} / ${view.h}` }}>
          {view.tiles.map((tile) => (
            <img
              key={tile.url}
              src={tile.url}
              alt=""
              style={{
                left: pct(tile.x, view.w),
                top: pct(tile.y, view.h),
                width: pct(tile.w, view.w),
                height: pct(tile.h, view.h),
              }}
              onError={() => {
                if (!useEsri) setUseEsri(true); // e.g. Maps Static API not enabled for the key
              }}
            />
          ))}
          {numbered.length === 0 && (
          <div
            className="print-box"
            style={{
              left: pct(box.a.x, view.w),
              top: pct(box.a.y, view.h),
              width: pct(box.b.x - box.a.x, view.w),
              height: pct(box.b.y - box.a.y, view.h),
            }}
          />
          )}
          {numbered.map(({ n, g }) => {
            const p = project(view, g.lat, g.lng);
            return (
              <span key={g.key} className="print-marker" style={{ left: pct(p.x, view.w), top: pct(p.y, view.h) }}>
                {n}
              </span>
            );
          })}
        </div>
        <p className="print-credit">{useEsri ? 'Map © Esri and its data providers' : 'Map data © Google'}</p>

        {numbered.length === 0 ? (
          <p>{t.emptyMap}</p>
        ) : (
          <table className="print-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t.names}</th>
                <th>{t.streetName}</th>
                <th>{t.streetNumber}</th>
                <th>{t.aptShort}</th>
                <th>{t.floor}</th>
                <th>{t.printLatLng}</th>
                {hasNotes && <th>{t.notes}</th>}
              </tr>
            </thead>
            <tbody>
              {numbered.flatMap(({ n, g }) =>
                g.pins.map((p, i) => (
                  <tr key={p.id} className={i === 0 ? 'group-start' : undefined}>
                    <td className="num">{i === 0 ? n : ''}</td>
                    <td>{p.names || '—'}</td>
                    <td>{p.streetName ?? ''}</td>
                    <td className="street">{p.streetNumber ?? ''}</td>
                    <td>{p.aptNumber ?? (p.floor ? '' : (p.apartment ?? ''))}</td>
                    <td>{p.floor ?? ''}</td>
                    <td className="coords">
                      {p.lat.toFixed(6)}, {p.lng.toFixed(6)}
                    </td>
                    {hasNotes && <td className="print-notes">{p.notes ?? ''}</td>}
                  </tr>
                )),
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
