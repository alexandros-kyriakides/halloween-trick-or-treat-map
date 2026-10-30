import { useEffect, useRef } from 'react';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { BOUNDS, CENTER } from './config';
import type { LatLng, PinGroup } from './geo';
import type { BaseLayer, MapHandle } from './MapView';

type Props = {
  apiKey: string;
  language: string;
  baseLayer: BaseLayer;
  groups: PinGroup[];
  selectedKey: string | null;
  draft: LatLng | null;
  userPos: LatLng | null;
  placing: boolean;
  onGroupTap: (g: PinGroup) => void;
  onMapTap: (p: LatLng) => void;
  onDraftMove: (p: LatLng) => void;
  onFail: () => void;
  mapRef?: React.MutableRefObject<MapHandle | null>;
};

// Same pumpkin as the Leaflet pins, as an SVG image (Google markers take image URLs).
// Only numbers go into this SVG, never user text.
function pumpkinUrl(count: number, draft = false) {
  const badge =
    count > 1
      ? `<circle cx="40" cy="10" r="9" fill="#3B1F4A" stroke="#FFD23F" stroke-width="2"/>` +
        `<text x="40" y="14" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="11" fill="#FFD23F">${count}</text>`
      : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 58" width="52" height="58">
    <path d="M24 57 L17 45 H31 Z" fill="#3B1F4A"/>
    <path d="M24 13c-3-1-6-1-9 1C7 14 3 21 3 29s5 17 13 17c3 0 5-1 8-2 3 1 5 2 8 2 8 0 13-9 13-17s-4-15-12-15c-3-2-6-2-9-1z"
      fill="${draft ? '#FFD23F' : '#FF8A1F'}" stroke="#3B1F4A" stroke-width="2.5"/>
    <path d="M17 15c-2 5-2 23 0 30M31 15c2 5 2 23 0 30" fill="none" stroke="#3B1F4A" stroke-opacity=".35" stroke-width="2"/>
    <path d="M24 13c0-5 2-8 6-10" fill="none" stroke="#3E7B39" stroke-width="3.5" stroke-linecap="round"/>
    ${draft ? '' : '<path d="M13 25l6 4-6 2zM35 25l-6 4 6 2zM15 35c5 4 13 4 18 0-3 5-15 5-18 0z" fill="#FFD23F"/>'}
    ${badge}</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function pumpkinIcon(count: number, selected: boolean, draft = false): google.maps.Icon {
  const s = selected || draft ? 1.25 : 1;
  return {
    url: pumpkinUrl(count, draft),
    scaledSize: new google.maps.Size(52 * s, 58 * s),
    anchor: new google.maps.Point(24 * s, 57 * s),
  };
}

let optionsSet = false;

export function GoogleMapView(props: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const markers = useRef<google.maps.Marker[]>([]);
  const draftMarker = useRef<google.maps.Marker | null>(null);
  const userMarker = useRef<google.maps.Marker | null>(null);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    let cancelled = false;
    // Google calls this global if the key is rejected (wrong key, billing off, domain not allowed).
    (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => latest.current.onFail();

    if (!optionsSet) {
      setOptions({ key: props.apiKey, v: 'weekly', language: props.language, region: 'CY' });
      optionsSet = true;
    }
    Promise.all([importLibrary('maps'), importLibrary('marker')])
      .then(() => {
        if (cancelled || !el.current) return;
        const area = new google.maps.LatLngBounds(
          { lat: BOUNDS.south, lng: BOUNDS.west },
          { lat: BOUNDS.north, lng: BOUNDS.east },
        );
        const padLat = (BOUNDS.north - BOUNDS.south) * 0.15;
        const padLng = (BOUNDS.east - BOUNDS.west) * 0.15;
        const m = new google.maps.Map(el.current, {
          center: { lat: CENTER[0], lng: CENTER[1] },
          zoom: 15,
          mapTypeId: latest.current.baseLayer === 'satellite' ? 'hybrid' : 'roadmap',
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
          clickableIcons: false,
          tilt: 0,
          restriction: {
            latLngBounds: {
              south: BOUNDS.south - padLat,
              north: BOUNDS.north + padLat,
              west: BOUNDS.west - padLng,
              east: BOUNDS.east + padLng,
            },
            strictBounds: false,
          },
        });
        m.fitBounds(area, 0);

        // Tint everything outside the area, and draw its edge.
        const world = [
          { lat: 85, lng: -179.9 },
          { lat: 85, lng: 0 },
          { lat: 85, lng: 179.9 },
          { lat: -85, lng: 179.9 },
          { lat: -85, lng: 0 },
          { lat: -85, lng: -179.9 },
        ];
        const hole = [
          { lat: BOUNDS.south, lng: BOUNDS.west },
          { lat: BOUNDS.south, lng: BOUNDS.east },
          { lat: BOUNDS.north, lng: BOUNDS.east },
          { lat: BOUNDS.north, lng: BOUNDS.west },
        ];
        new google.maps.Polygon({
          map: m,
          paths: [world, hole],
          strokeOpacity: 0,
          fillColor: '#3B1F4A',
          fillOpacity: 0.55,
          clickable: false,
        });
        new google.maps.Rectangle({
          map: m,
          bounds: area,
          strokeColor: '#FF8A1F',
          strokeWeight: 3,
          fillOpacity: 0,
          clickable: false,
        });

        m.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (e.latLng) latest.current.onMapTap({ lat: e.latLng.lat(), lng: e.latLng.lng() });
        });
        map.current = m;
        if (props.mapRef) {
          props.mapRef.current = {
            focus: (p, minZoom) => {
              m.panTo(p);
              m.setZoom(Math.max(m.getZoom() ?? 0, minZoom));
            },
          };
        }
        drawPins();
        drawDraft();
        drawUser();
      })
      .catch(() => {
        if (!cancelled) latest.current.onFail();
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function drawPins() {
    const m = map.current;
    if (!m) return;
    for (const mk of markers.current) mk.setMap(null);
    const p = latest.current;
    markers.current = p.groups.map((g) => {
      const selected = g.key === p.selectedKey;
      const mk = new google.maps.Marker({
        map: m,
        position: { lat: g.lat, lng: g.lng },
        icon: pumpkinIcon(g.pins.length, selected),
        title: String(g.pins.length),
        zIndex: selected ? 1000 : 1,
        opacity: p.placing ? 0.6 : 1,
      });
      mk.addListener('click', () => {
        if (latest.current.placing) latest.current.onMapTap({ lat: g.lat, lng: g.lng });
        else latest.current.onGroupTap(g);
      });
      return mk;
    });
  }

  function drawDraft() {
    const m = map.current;
    if (!m) return;
    const d = latest.current.draft;
    if (!d) {
      draftMarker.current?.setMap(null);
      draftMarker.current = null;
      return;
    }
    if (!draftMarker.current) {
      draftMarker.current = new google.maps.Marker({
        map: m,
        position: d,
        icon: pumpkinIcon(1, true, true),
        draggable: true,
        zIndex: 2000,
      });
      draftMarker.current.addListener('dragend', () => {
        const pos = draftMarker.current?.getPosition();
        if (pos) latest.current.onDraftMove({ lat: pos.lat(), lng: pos.lng() });
      });
    } else {
      draftMarker.current.setPosition(d);
    }
  }

  function drawUser() {
    const m = map.current;
    if (!m) return;
    const u = latest.current.userPos;
    if (!u) {
      userMarker.current?.setMap(null);
      userMarker.current = null;
      return;
    }
    if (!userMarker.current) {
      userMarker.current = new google.maps.Marker({
        map: m,
        position: u,
        clickable: false,
        zIndex: 1500,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: '#2F80ED',
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 3,
        },
      });
    } else {
      userMarker.current.setPosition(u);
    }
  }

  useEffect(drawPins, [props.groups, props.selectedKey, props.placing]);
  useEffect(drawDraft, [props.draft]);
  useEffect(drawUser, [props.userPos]);
  useEffect(() => {
    map.current?.setMapTypeId(props.baseLayer === 'satellite' ? 'hybrid' : 'roadmap');
  }, [props.baseLayer]);

  return <div className={`map${props.placing ? ' map-placing' : ''}`} ref={el} />;
}
