import type { LatLngPosition } from '../geo';
import { EPSG_DEFINITIONS, proj4 } from '../wgs-convert';

/**
 * WGS84 ↔ EPSG:3035 (ETRS89-LAEA Europe).
 *
 * Das Höhenmodell bleibt im Koordinatensystem der Quelle: EPSG:3035 ist
 * flächentreu, eine Zelle ist damit exakt 1 m × 1 m. Jede Umprojektion des
 * Rasters würde schmale Dammkronen abflachen — genau die Objekte, die im
 * Wasserstandsmodell über den Wasserweg entscheiden.
 *
 * Der Preis ist die Meridiankonvergenz: bei 16,8° Ost liegt ein achsparalleler
 * Block auf der north-up-Karte um etwa 5° gedreht. Für das Rendern ist das
 * gleichgültig, weil pixelweise zurückprojiziert wird.
 */

const LAEA = EPSG_DEFINITIONS['EPSG:3035'];

/** Ostwert und Nordwert in Metern. */
export interface LaeaPoint {
  e: number;
  n: number;
}

/**
 * proj4 mit nur einer Projektion nimmt WGS84 als Quelle an — die Kurzform, die
 * `wgs-convert.ts` schon verwendet.
 */
export function wgs84ToLaea([lat, lng]: LatLngPosition): LaeaPoint {
  const [e, n] = proj4(LAEA, [lng, lat]) as unknown as [number, number];
  return { e, n };
}

export function laeaToWgs84({ e, n }: LaeaPoint): LatLngPosition {
  const [lng, lat] = proj4(LAEA, 'WGS84', [e, n]) as unknown as [
    number,
    number,
  ];
  return [lat, lng];
}
