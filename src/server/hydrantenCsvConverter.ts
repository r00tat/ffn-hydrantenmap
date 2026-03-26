import { geohashForLocation } from 'geofire-common';
import { GEOHASH_PRECISION } from '../common/gis-objects';
import { gk34ToWgs84 } from '../common/wgs-convert';
import type { ParsedHydrantRow } from './hydrantenCsvParser';

export interface ConvertedHydrantRow extends ParsedHydrantRow {
  lat: number;
  lng: number;
  geohash: string;
  name: string;
}

export function convertCoordinates(
  rows: ParsedHydrantRow[]
): ConvertedHydrantRow[] {
  return rows
    .map((row) => {
      if (Number.isNaN(row.raw_x) || Number.isNaN(row.raw_y)) return null;

      const wgs = gk34ToWgs84(row.raw_x, row.raw_y, 'EPSG:31256');
      const lat = wgs.y;
      const lng = wgs.x;

      if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

      const geohash = geohashForLocation([lat, lng], GEOHASH_PRECISION);

      return {
        ...row,
        lat,
        lng,
        geohash,
        name: row.documentKey,
      };
    })
    .filter((row): row is ConvertedHydrantRow => row !== null);
}
