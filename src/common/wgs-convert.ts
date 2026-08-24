import * as _proj4 from 'proj4';
import { Coordinates } from './gis-objects';

// Handle CJS/ESM interop: webpack wraps as {default: fn}, vitest/node exposes fn directly
const proj4 = (typeof _proj4 === 'function' ? _proj4 : (_proj4 as any).default) as typeof _proj4;

export { proj4 };

/**
 * Inline proj4 definitions for Austrian coordinate systems.
 * Avoids importing the full epsg database (~200KB).
 * See https://epsg.io/31256 and https://epsg.io/31259
 */
export const EPSG_DEFINITIONS: Record<string, string> = {
  'EPSG:31256':
    '+proj=tmerc +lat_0=0 +lon_0=16.33333333333333 +k=1 +x_0=0 +y_0=-5000000 +ellps=bessel +towgs84=577.326,90.129,463.919,5.137,1.474,5.297,2.4232 +units=m +no_defs',
  'EPSG:31259':
    '+proj=tmerc +lat_0=0 +lon_0=16.33333333333333 +k=1 +x_0=750000 +y_0=-5000000 +ellps=bessel +towgs84=577.326,90.129,463.919,5.137,1.474,5.297,2.4232 +units=m +no_defs',
  // MGI geographisch (Bessel 1841). Das amtliche BEV-Hoehen-Grid, das
  // EVRF2000-Hoehen in Gebrauchshoehen (Adria) ueberfuehrt, fuehrt seine
  // Koordinaten in diesem System.
  'EPSG:4312':
    '+proj=longlat +ellps=bessel +towgs84=577.326,90.129,463.919,5.137,1.474,5.297,2.4232 +no_defs',
  // ETRS89-LAEA Europe: das Koordinatensystem des BEV-ALS-DGM und damit des
  // eigenen Hoehenmodells. Flaechentreu, eine Zelle ist exakt 1 m x 1 m.
  'EPSG:3035':
    '+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
};

/**
 * source: https://agsolutions.at/en/blog/transforming-vienna-gis-to-wgs84-coordinates/
 * EPSG code 31256 = MGI Austria GK East, Gauss-Krüger M 34 (DKM), Greenwich
 * Cadastral plan in Eastern Austria (Irenental)
 * see https://www.esri-austria.at/service/projektionen-oesterreich/ and https://de.wikipedia.org/wiki/Datum_Austria
 */
export const gk34ToWgs84 = (
  x: number,
  y: number,
  epsgSystem: string = 'EPSG:31259'
): Coordinates => {
  const definition = EPSG_DEFINITIONS[epsgSystem];
  if (!definition) {
    throw new Error(`Unknown EPSG system: ${epsgSystem}. Add it to EPSG_DEFINITIONS in wgs-convert.ts`);
  }
  const result = proj4(definition, 'WGS84', Object.assign({}, { x, y }));
  return result;
};
