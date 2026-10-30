// Map area: a 2 km x 2 km box centred on Michalis Tourapis Park, Nicosia.
// North/south/east/west are 1 km geodesic offsets from the centre (WGS84).
// Keep in sync with the bounds in amplify/data/resolvers/{createEntry,updateEntry}.js.
export const CENTER: [number, number] = [35.0757663, 33.313154];
export const BOUNDS = {
  south: 35.0667526,
  north: 35.08478,
  west: 33.3021896,
  east: 33.3241184,
};

/** Entries closer than this are shown as one pin (an apartment building, or a house with two families). */
export const GROUP_RADIUS_M = 15;

/** How often the map reloads the list of homes. */
export const REFRESH_MS = 2 * 60 * 1000;

// OpenStreetMap does not have the individual houses of this neighbourhood mapped, so the map
// opens on satellite imagery (houses visible) with street names on top. OSM also lacks most
// street names here, so "Map" uses Esri's World Street Map (commercial road data) instead.
export const STREET_MAP_TILES =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
export const STREET_MAP_ATTRIBUTION =
  'Map &copy; Esri, HERE, Garmin, USGS, NGA, and the GIS User Community';
export const SATELLITE_TILES =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
export const STREET_LABEL_TILES =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}';
export const SATELLITE_ATTRIBUTION =
  'Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community';

/** Must match the resolver limits in amplify/data/resolvers. */
export const LIMITS = { apartment: 40, names: 60, buzzer: 40, notes: 200 } as const;
