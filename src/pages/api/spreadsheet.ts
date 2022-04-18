// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  createFilterProps,
  GeoFilterProperties,
  GeoJsonFeatureColleaction,
} from '../../server/geojson';
import { exportSpreadsheetGeoJson } from '../../server/spreadsheet';
import tokenRequired from '../../server/tokenRequired';

const asNumber = (value: string | string[]) => {
  const x = Number.parseFloat(value instanceof Array ? value[0] : value);
  return Number.isNaN(x) ? 0 : x;
};

export interface ErrorMessage {
  error: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GeoJsonFeatureColleaction | ErrorMessage>
) {
  if (!(await tokenRequired(req, res))) {
    // authorization failed
    return;
  }

  if (!req.query.spreadsheetId || !req.query.range) {
    res.status(400).json({
      error: 'spreadsheetId and range are required',
    });
  }

  let filterProps: GeoFilterProperties;

  try {
    filterProps = createFilterProps({
      lat: req.query.lat,
      lng: req.query.lng,
      radius: req.query.radius,
      bbox: req.query.bbox,
    });
  } catch (err) {
    res.status(400).json({ error: (err as ErrorMessage).error });
    return;
  }

  // console.info(`loading geojson for ${pos} with radius ${radius}`);
  const featureCollection = await exportSpreadsheetGeoJson(
    `${req.query.spreadsheetId}`,
    `${req.query.range}`,
    filterProps
  );
  res.status(200).json(featureCollection);
}
