'use server';

import 'server-only';
import { actionUserAuthorizedForFirecall } from '../../app/auth';
import { GeoPosition, LatLngPosition } from '../../common/geo';
import {
  boundingBoxRadiusM,
  boundingBoxWithMargin,
} from '../../common/lagekarte/bbox';
import exportGeoJson, {
  GeoJsonFeatureColleaction,
} from '../../server/geojson';

/** Puffer um die Bounding-Box aller Einsatz-Elemente, in Metern. */
const GIS_MARGIN_M = 300;

export interface LagekarteGisRequest {
  firecallId: string;
  positions: LatLngPosition[];
}

/**
 * Die statischen GIS-Daten im Ausschnitt des Einsatzes. Fällt der Aufruf aus,
 * wird der Export ohne GIS-Gruppe erzeugt — deshalb gibt die Action im
 * Fehlerfall `undefined` zurück statt zu werfen.
 */
export async function loadLagekarteGis({
  firecallId,
  positions,
}: LagekarteGisRequest): Promise<GeoJsonFeatureColleaction | undefined> {
  await actionUserAuthorizedForFirecall(firecallId);

  const bbox = boundingBoxWithMargin(positions, GIS_MARGIN_M);
  if (!bbox) return undefined;

  const [west, south, east, north] = bbox;
  const center = new GeoPosition((south + north) / 2, (west + east) / 2);

  // Der Radius bestimmt, welche Geohash-Cluster überhaupt geladen werden; die
  // BBox filtert erst danach. Er muss die BBox also umschließen, sonst fehlen
  // die Hydranten am Rand. `exportGeoJson` klemmt auf 200 m bis 10 km.
  const radiusInM = boundingBoxRadiusM(bbox);

  try {
    return await exportGeoJson(center, radiusInM, bbox);
  } catch (err) {
    console.error(`lagekarte gis export failed: ${err}`);
    return undefined;
  }
}
