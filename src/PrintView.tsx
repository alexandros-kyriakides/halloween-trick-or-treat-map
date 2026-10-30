import { useMemo, useState } from 'react';
import { BOUNDS, CENTER } from './config';
import type { PinGroup } from './geo';
import type { BaseLayer } from './MapView';
import type { T } from './i18n';
import { detectPlatform } from './locationHelp';

// A printable page: one map image of the whole area with numbered markers, and a numbered
// list of the homes. The map image comes from Google's Maps Static API when a Google key is
// set (it must have "Maps Static API" enabled), otherwise, or if that fails, from Esri.

type View = { url: string; west: number; east: number; north: number; south: number; w: number; h: number };

const SIZE = 440; // CSS pixels; images are requested at 2x for sharp printing

function mercY(lat: number) {
  const r = (lat * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + r / 2));
}
function latFromMercY(y: number) {
  return ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;
}

function googleView(key: string, base: BaseLayer, lang: string): View {
  // Zoom 15 fits the 1.5 km box (~384 px) inside 440 px at this latitude.
  const zoom = 15;
  const worldPx = 256 * 2 ** zoom;
  const degPerPx = 360 / worldPx;
  const west = CENTER[1] - (SIZE / 2) * degPerPx;
  const east = CENTER[1] + (SIZE / 2) * degPerPx;
  const radPerPx = (2 * Math.PI) / worldPx;
  const cy = mercY(CENTER[0]);
  const north = latFromMercY(cy + (SIZE / 2) * radPerPx);
  const south = latFromMercY(cy - (SIZE / 2) * radPerPx);
  const url =
    'https://maps.googleapis.com/maps/api/staticmap?' +
    new URLSearchParams({
      center: `${CENTER[0]},${CENTER[1]}`,
      zoom: String(zoom),
      size: `${SIZE}x${SIZE}`,
      scale: '2',
      maptype: base === 'satellite' ? 'hybrid' : 'roadmap',
      language: lang,
      key,
    }).toString();
  return { url, west, east, north, south, w: SIZE, h: SIZE };
}

function esriView(base: BaseLayer): View {
  const padLat = (BOUNDS.north - BOUNDS.south) * 0.08;
  const padLng = (BOUNDS.east - BOUNDS.west) * 0.08;
  const v = { west: BOUNDS.west - padLng, east: BOUNDS.east + padLng, north: BOUNDS.north + padLat, south: BOUNDS.south - padLat };
  const service = base === 'satellite' ? 'World_Imagery' : 'World_Street_Map';
  // Keep the image's aspect equal to the box's aspect in Web Mercator, so markers line up.
  const aspect = ((v.east - v.west) * Math.PI) / 180 / (mercY(v.north) - mercY(v.south));
  const w = SIZE;
  const h = Math.round(SIZE / aspect);
  const url =
    `https://server.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/export?` +
    new URLSearchParams({
      bbox: `${v.west},${v.south},${v.east},${v.north}`,
      bboxSR: '4326',
      imageSR: '3857',
      size: `${w * 2},${h * 2}`,
      format: 'jpg',
      f: 'image',
    }).toString();
  return { url, ...v, w, h };
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
  const view = useMemo(
    () => (useEsri ? esriView(props.baseLayer) : googleView(props.googleKey, props.baseLayer, props.lang)),
    [useEsri, props.baseLayer, props.googleKey, props.lang],
  );
  const numbered = useMemo(() => numberGroups(props.groups), [props.groups]);
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
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = view.url;
      await img.decode();
      const s = 2;
      const canvas = document.createElement('canvas');
      canvas.width = view.w * s;
      canvas.height = view.h * s;
      const c = canvas.getContext('2d')!;
      c.drawImage(img, 0, 0, canvas.width, canvas.height);
      c.strokeStyle = '#FF8A1F';
      c.lineWidth = 3 * s;
      c.strokeRect(box.a.x * s, box.a.y * s, (box.b.x - box.a.x) * s, (box.b.y - box.a.y) * s);
      for (const { n, g } of numbered) {
        const p = project(view, g.lat, g.lng);
        c.beginPath();
        c.arc(p.x * s, p.y * s, 10 * s, 0, Math.PI * 2);
        c.fillStyle = '#FF8A1F';
        c.fill();
        c.lineWidth = 2 * s;
        c.strokeStyle = '#3B1F4A';
        c.stroke();
        c.fillStyle = '#3B1F4A';
        c.font = `bold ${11 * s}px Arial`;
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
          <img
            src={view.url}
            alt=""
            width={view.w}
            height={view.h}
            onError={() => {
              if (!useEsri) setUseEsri(true); // e.g. Maps Static API not enabled for the key
            }}
          />
          <div
            className="print-box"
            style={{
              left: pct(box.a.x, view.w),
              top: pct(box.a.y, view.h),
              width: pct(box.b.x - box.a.x, view.w),
              height: pct(box.b.y - box.a.y, view.h),
            }}
          />
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
          <ol className="print-list">
            {numbered.map(({ n, g }) => (
              <li key={g.key} value={n}>
                {g.pins.map((p) => (
                  <div key={p.id} className="print-entry">
                    <strong>{p.names || '🎃'}</strong>
                    {(p.aptNumber || p.floor) && (
                      <span>
                        {' '}
                        · {p.aptNumber ? `${t.aptShort} ${p.aptNumber}` : ''}
                        {p.aptNumber && p.floor ? ', ' : ''}
                        {p.floor ? `${t.floorShort} ${p.floor}` : ''}
                      </span>
                    )}
                    {!p.aptNumber && !p.floor && p.apartment && <span> · {p.apartment}</span>}
                    {p.notes && <span className="print-notes"> · {p.notes}</span>}
                  </div>
                ))}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
