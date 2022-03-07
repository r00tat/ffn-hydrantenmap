import * as epsg from 'epsg';
import * as proj4 from 'proj4';
import { Coordinates } from './gis-objects';

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
  const result = proj4(epsg[epsgSystem], 'WGS84', Object.assign({}, { x, y }));
  // console.log(x + ', ' + y + ' = ' + result.y + ', ' + result.x);
  return result;
};
