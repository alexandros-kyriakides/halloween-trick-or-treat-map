import { BOUNDS, GROUP_RADIUS_M } from './config';
import type { Pin } from './api';

export type LatLng = { lat: number; lng: number };

export function distanceM(a: LatLng, b: LatLng): number {
  const R = 6371008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function insideArea(p: LatLng): boolean {
  return p.lat >= BOUNDS.south && p.lat <= BOUNDS.north && p.lng >= BOUNDS.west && p.lng <= BOUNDS.east;
}

export type PinGroup = { key: string; lat: number; lng: number; pins: Pin[] };

/** Groups entries within GROUP_RADIUS_M into one map pin. Stable: anchored on the oldest-listed entry. */
export function groupPins(pins: Pin[]): PinGroup[] {
  const sorted = [...pins].sort((a, b) => a.id.localeCompare(b.id));
  const groups: PinGroup[] = [];
  for (const pin of sorted) {
    const g = groups.find((x) => distanceM(x, pin) <= GROUP_RADIUS_M);
    if (g) g.pins.push(pin);
    else groups.push({ key: pin.id, lat: pin.lat, lng: pin.lng, pins: [pin] });
  }
  for (const g of groups) {
    g.pins.sort((a, b) => (a.apartment ?? '').localeCompare(b.apartment ?? '', undefined, { numeric: true }));
  }
  return groups;
}

export function nearestGroup(groups: PinGroup[], p: LatLng, ignoreId?: string): PinGroup | undefined {
  let best: PinGroup | undefined;
  let bestD = Infinity;
  for (const g of groups) {
    if (g.pins.length === 1 && g.pins[0].id === ignoreId) continue;
    const d = distanceM(g, p);
    if (d <= GROUP_RADIUS_M && d < bestD) {
      best = g;
      bestD = d;
    }
  }
  return best;
}
