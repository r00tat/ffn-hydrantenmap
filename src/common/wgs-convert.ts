import * as _proj4 from 'proj4';
import { Coordinates } from './gis-objects';

// Handle CJS/ESM interop: webpack wraps as {default: fn}, vitest/node exposes fn directly
const proj4 = (typeof _proj4 === 'function' ? _proj4 : (_proj4 as any).default) as typeof _proj4;

/**
 * Inline proj4 definitions for Austrian coordinate systems.
 * Avoids importing the full epsg database (~200KB).
 * See https://epsg.io/31256 and https://epsg.io/31259
 */
const EPSG_DEFINITIONS: Record<string, string> = {
  'EPSG:31256':
    '+proj=tmerc +lat_0=0 +lon_0=16.33333333333333 +k=1 +x_0=0 +y_0=-5000000 +ellps=bessel +towgs84=577.326,90.129,463.919,5.137,1.474,5.297,2.4232 +units=m +no_defs',
  'EPSG:31259':
    '+proj=tmerc +lat_0=0 +lon_0=16.33333333333333 +k=1 +x_0=750000 +y_0=-5000000 +ellps=bessel +towgs84=577.326,90.129,463.919,5.137,1.474,5.297,2.4232 +units=m +no_defs',
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
