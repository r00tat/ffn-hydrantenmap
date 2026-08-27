import { LatLngPosition } from '../geo';

const METERS_PER_DEGREE_LAT = 111_320;

/**
 * Umschließendes Rechteck aller Positionen plus Puffer, als GeoJSON-BBox
 * `[west, south, east, north]`. Damit passt sich der GIS-Ausschnitt an
 * weitläufige Lagen an — eine lange Zubringleitung nimmt die Hydranten am
 * anderen Ende mit.
 *
 * Steht bewusst hier und nicht in `lagekarteGisAction.ts`: eine Datei mit
 * `'use server'` darf ausschließlich async Funktionen exportieren.
 */
export function boundingBoxWithMargin(
  positions: LatLngPosition[],
  marginM: number,
): GeoJSON.BBox | undefined {
  if (!positions.length) return undefined;

  const lats = positions.map(([lat]) => lat);
  const lngs = positions.map(([, lng]) => lng);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const west = Math.min(...lngs);
  const east = Math.max(...lngs);

  const dLat = marginM / METERS_PER_DEGREE_LAT;
  const midLat = (south + north) / 2;
  // Ein Längengrad wird zu den Polen hin kürzer; die Schranke bei 0.1 verhindert
  // eine Division gegen Null in Polnähe.
  const dLng =
    marginM /
    (METERS_PER_DEGREE_LAT * Math.max(0.1, Math.cos((midLat * Math.PI) / 180)));

  return [west - dLng, south - dLat, east + dLng, north + dLat];
}

const EARTH_RADIUS_M = 6_371_000;

/**
 * Radius in Metern, der die BBox von ihrem Mittelpunkt aus vollständig
 * umschließt — die halbe Diagonale.
 *
 * Nötig, weil `getClusters` die Geohash-Cluster **nach Radius** holt und die
 * BBox erst danach filtert (`geoFilterFactory`). Mit einem zu kleinen Radius
 * werden die Cluster am Rand der BBox nie geladen, und die Hydranten am Ende
 * einer langen Zubringleitung fehlen still.
 */
export function boundingBoxRadiusM(bbox: GeoJSON.BBox): number {
  const [west, south, east, north] = bbox;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const midLat = (south + north) / 2;
  const halfHeight = (toRad(north - south) / 2) * EARTH_RADIUS_M;
  const halfWidth =
    (toRad(east - west) / 2) * EARTH_RADIUS_M * Math.cos(toRad(midLat));
  return Math.sqrt(halfHeight ** 2 + halfWidth ** 2);
}
