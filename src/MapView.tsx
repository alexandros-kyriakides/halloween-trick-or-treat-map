import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BOUNDS, OSM_ATTRIBUTION, OSM_TILES } from './config';
import type { LatLng, PinGroup } from './geo';

type Props = {
  groups: PinGroup[];
  selectedKey: string | null;
  draft: LatLng | null;
  userPos: LatLng | null;
  placing: boolean;
  onGroupTap: (g: PinGroup) => void;
  onMapTap: (p: LatLng) => void;
  onDraftMove: (p: LatLng) => void;
  mapRef?: React.MutableRefObject<L.Map | null>;
};

const area = L.latLngBounds([BOUNDS.south, BOUNDS.west], [BOUNDS.north, BOUNDS.east]);

// The one decorative element: a small glowing jack-o'-lantern pin. Count badge for shared buildings.
// Only numbers are put into this HTML, never user text.
function pumpkinHtml(count: number, selected: boolean, draft = false) {
  const badge = count > 1 ? `<span class="pin-badge">${count}</span>` : '';
  return `<div class="pin${selected ? ' pin-selected' : ''}${draft ? ' pin-draft' : ''}">
    <svg viewBox="0 0 48 56" width="40" height="46" aria-hidden="true">
      <path d="M24 55 L17 43 H31 Z" fill="#3B1F4A"/>
      <path d="M24 11c-3-1-6-1-9 1C7 12 3 19 3 27s5 17 13 17c3 0 5-1 8-2 3 1 5 2 8 2 8 0 13-9 13-17s-4-15-12-15c-3-2-6-2-9-1z"
        fill="${draft ? '#FFD23F' : '#FF8A1F'}" stroke="#3B1F4A" stroke-width="2.5"/>
      <path d="M17 13c-2 5-2 23 0 30M31 13c2 5 2 23 0 30" fill="none" stroke="#3B1F4A" stroke-opacity=".35" stroke-width="2"/>
      <path d="M24 11c0-5 2-8 6-10" fill="none" stroke="#3E7B39" stroke-width="3.5" stroke-linecap="round"/>
      ${draft ? '' : `<path d="M13 23l6 4-6 2zM35 23l-6 4 6 2zM15 33c5 4 13 4 18 0-3 5-15 5-18 0z" fill="#FFD23F"/>`}
    </svg>${badge}</div>`;
}

function icon(count: number, selected: boolean, draft = false) {
  return L.divIcon({
    html: pumpkinHtml(count, selected, draft),
    className: 'pin-wrap',
    iconSize: [40, 46],
    iconAnchor: [20, 45],
  });
}

export function MapView(props: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<L.LayerGroup | null>(null);
  const draftMarker = useRef<L.Marker | null>(null);
  const userMarker = useRef<L.CircleMarker | null>(null);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const m = L.map(el.current!, {
      zoomSnap: 0.25,
      maxBounds: area.pad(0.08),
      maxBoundsViscosity: 1,
      attributionControl: true,
    });
    L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: OSM_ATTRIBUTION }).addTo(m);

    // Plum-tinted mask over everything outside the 2 km box, plus a dashed edge.
    const world: L.LatLngTuple[] = [[-89, -179], [-89, 179], [89, 179], [89, -179]];
    const hole: L.LatLngTuple[] = [
      [BOUNDS.south, BOUNDS.west],
      [BOUNDS.north, BOUNDS.west],
      [BOUNDS.north, BOUNDS.east],
      [BOUNDS.south, BOUNDS.east],
    ];
    L.polygon([world, hole], { stroke: false, fillColor: '#3B1F4A', fillOpacity: 0.55, interactive: false }).addTo(m);
    L.rectangle(area, { color: '#FF8A1F', weight: 2, dashArray: '6 6', fill: false, interactive: false }).addTo(m);

    const fit = () => {
      const z = m.getBoundsZoom(area, false);
      m.setMinZoom(z);
      return z;
    };
    m.fitBounds(area);
    fit();
    m.on('resize', fit);
    m.on('click', (e: L.LeafletMouseEvent) => latest.current.onMapTap({ lat: e.latlng.lat, lng: e.latlng.lng }));

    markers.current = L.layerGroup().addTo(m);
    map.current = m;
    if (props.mapRef) props.mapRef.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Home pins
  useEffect(() => {
    const layer = markers.current;
    if (!layer) return;
    layer.clearLayers();
    for (const g of props.groups) {
      const mk = L.marker([g.lat, g.lng], {
        icon: icon(g.pins.length, g.key === props.selectedKey),
        keyboard: true,
        title: String(g.pins.length),
        zIndexOffset: g.key === props.selectedKey ? 1000 : 0,
        opacity: props.placing ? 0.6 : 1,
      });
      mk.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (latest.current.placing) latest.current.onMapTap({ lat: g.lat, lng: g.lng });
        else latest.current.onGroupTap(g);
      });
      mk.addTo(layer);
    }
  }, [props.groups, props.selectedKey, props.placing]);

  // The pin being placed
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!props.draft) {
      draftMarker.current?.remove();
      draftMarker.current = null;
      return;
    }
    if (!draftMarker.current) {
      draftMarker.current = L.marker([props.draft.lat, props.draft.lng], {
        icon: icon(1, true, true),
        draggable: true,
        zIndexOffset: 2000,
        autoPan: true,
      }).addTo(m);
      draftMarker.current.on('dragend', () => {
        const p = draftMarker.current!.getLatLng();
        latest.current.onDraftMove({ lat: p.lat, lng: p.lng });
      });
    } else {
      draftMarker.current.setLatLng([props.draft.lat, props.draft.lng]);
    }
  }, [props.draft]);

  // "You are here" dot
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!props.userPos) {
      userMarker.current?.remove();
      userMarker.current = null;
      return;
    }
    if (!userMarker.current) {
      userMarker.current = L.circleMarker([props.userPos.lat, props.userPos.lng], {
        radius: 8,
        color: '#FFFFFF',
        weight: 3,
        fillColor: '#2F80ED',
        fillOpacity: 1,
        interactive: false,
      }).addTo(m);
    } else {
      userMarker.current.setLatLng([props.userPos.lat, props.userPos.lng]);
    }
  }, [props.userPos]);

  // Leaflet adds its own classes to the element it manages, so React must never re-render
  // that element's className: the changing class goes on a wrapper instead.
  return (
    <div className={`map${props.placing ? ' map-placing' : ''}`}>
      <div ref={el} className="map-inner" />
    </div>
  );
}
