import { LatLngPosition } from '../geo';
import type {
  LagekarteCouplingCollection,
  LagekarteFeature,
  LagekarteGroup,
} from './types';

/**
 * Schlauchtypen, die lagekarte.info als `lineType` kennt, mit der Länge einer
 * Schlauchlänge in Metern. Nur diese beiden sind durch die Referenz-Exporte
 * belegt — für D-Schlauch und Wasserwerfer wird kein `lineType` geschrieben.
 */
export const HOSE_LINE_TYPES: Record<
  string,
  { lineType: string; offset: number }
> = {
  B: { lineType: 'B-Line', offset: 20 },
  C: { lineType: 'C-Line', offset: 15 },
};

export function lineTypeFor(dimension?: string): string | undefined {
  return dimension ? HOSE_LINE_TYPES[dimension]?.lineType : undefined;
}

export function hoseOffsetFor(dimension?: string): number | undefined {
  return dimension ? HOSE_LINE_TYPES[dimension]?.offset : undefined;
}

const EARTH_RADIUS_M = 6_371_000;

function haversine(a: LatLngPosition, b: LatLngPosition): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function interpolate(
  a: LatLngPosition,
  b: LatLngPosition,
  t: number,
): LatLngPosition {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * Die Kupplungsmarker einer Schlauchleitung: alle `offset` Meter ein Punkt
 * entlang der Linie. lagekarte.info erzeugt sie selbst aus
 * `distanceMarkers: true`, schreibt sie aber zusätzlich als namenlose
 * FeatureCollection **vor** die Linie — das ahmen wir nach.
 */
export function buildCouplingCollection(
  positions: LatLngPosition[],
  offsetM: number,
): LagekarteCouplingCollection {
  const features: LagekarteFeature[] = [];
  if (positions.length >= 2 && offsetM > 0) {
    let carried = 0;
    for (let i = 0; i < positions.length - 1; i += 1) {
      const from = positions[i];
      const to = positions[i + 1];
      const segment = haversine(from, to);
      if (segment === 0) continue;
      let along = offsetM - carried;
      while (along <= segment) {
        const [lat, lng] = interpolate(from, to, along / segment);
        features.push({
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [lng, lat] },
        });
        along += offsetM;
      }
      carried = (carried + segment) % offsetM;
    }
  }
  return { type: 'FeatureCollection', features, properties: { options: {} } };
}

/**
 * Erkennt die abgeleitete Kupplungssammlung: eine FeatureCollection ohne `name`,
 * deren Features ausschließlich Punkte mit leeren `properties` sind. Beim Import
 * überspringen — sonst entstehen aus einer Leitung zusätzlich sinnlose Marker.
 */
export function isCouplingCollection(
  feature: LagekarteFeature | LagekarteCouplingCollection | LagekarteGroup,
): feature is LagekarteCouplingCollection {
  if (feature?.type !== 'FeatureCollection') return false;
  if ((feature as LagekarteGroup).name) return false;
  const features = (feature as LagekarteCouplingCollection).features;
  if (!Array.isArray(features)) return false;
  return features.every(
    (f) =>
      f?.geometry?.type === 'Point' &&
      Object.keys((f.properties ?? {}) as Record<string, unknown>).length === 0,
  );
}
