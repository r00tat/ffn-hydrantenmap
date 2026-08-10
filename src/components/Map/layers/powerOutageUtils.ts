export interface PowerOutage {
  id: string;
  lat: number;
  lng: number;
  netz: string;
  anlass: string;
  ausfallBeginn: string;
  ausfallEnde: string;
  netzbezirk: string;
  netzgemeinde: string;
  stationBezeichnung: string;
  stationNummer: string;
}

const EARTH_HALF_CIRCUMFERENCE = 20037508.34;

/**
 * Convert EPSG:3857 (Web Mercator) coordinates to WGS84 (lat/lng).
 */
export function epsg3857ToWgs84(x: number, y: number): [number, number] {
  const lng = (x / EARTH_HALF_CIRCUMFERENCE) * 180;
  const lat =
    (Math.atan(Math.exp((y / EARTH_HALF_CIRCUMFERENCE) * Math.PI)) * 2 -
      Math.PI / 2) *
    (180 / Math.PI);
  return [lat, lng];
}

function isNumberPair(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

/**
 * Extract the x/y position from a GeoJSON coordinate array.
 *
 * Netz Burgenland returns `OrientedPoint` geometries whose coordinates are
 * nested — `[[x, y], [dx, dy]]`, where the second pair is the orientation
 * vector. Plain `Point` geometries are flat — `[x, y]`. Anything else
 * (LineString, Polygon, missing or non-numeric values) yields `null`.
 */
export function extractPointCoordinates(
  coordinates: unknown
): [number, number] | null {
  if (!Array.isArray(coordinates)) return null;
  if (isNumberPair(coordinates)) return [coordinates[0], coordinates[1]];
  const first = coordinates[0];
  if (isNumberPair(first)) return [first[0], first[1]];
  return null;
}

export function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function asString(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseFeature(feature: unknown): PowerOutage | null {
  if (!isRecord(feature)) return null;

  const id = asString(feature._id);
  if (!id) return null;

  const geometry = isRecord(feature.geometry) ? feature.geometry : undefined;
  const coords = extractPointCoordinates(geometry?.coordinates);
  if (!coords) return null;

  const [lat, lng] = epsg3857ToWgs84(coords[0], coords[1]);
  if (!isValidLatLng(lat, lng)) return null;

  const props = isRecord(feature.properties) ? feature.properties : {};

  return {
    id,
    lat,
    lng,
    netz: asString(props.NETZ),
    anlass: asString(props.ANLASS),
    ausfallBeginn: asString(props.AUSFALL_BEGINN),
    ausfallEnde: asString(props.AUSFALL_ENDE),
    netzbezirk: asString(props.NETZBEZIRK),
    netzgemeinde: asString(props.NETZGEMEINDE),
    stationBezeichnung: asString(props.STATION_BEZEICHNUNG),
    stationNummer: asString(props.STATION_NUMMER),
  };
}

/**
 * Parse the Netz Burgenland `THEME_STOERUNGEN` FeatureCollection.
 *
 * Never throws and never emits markers with unusable coordinates — a change in
 * the upstream response format degrades to fewer (or zero) markers instead of
 * crashing the map.
 */
export function parsePowerOutageResponse(data: unknown): PowerOutage[] {
  if (!isRecord(data)) return [];
  if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    return [];
  }

  const outages: PowerOutage[] = [];
  for (const feature of data.features) {
    const outage = parseFeature(feature);
    if (outage) outages.push(outage);
  }
  return outages;
}

export function formatOutageTime(dateStr: string): string {
  if (!dateStr || dateStr.startsWith('31.12.2099')) return '';
  return dateStr;
}
