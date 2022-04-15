// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { GeoJsonFeatureColleaction } from '../../server/geojson';
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

  try {
    let bbox: GeoJSON.BBox = (
      req.query.bbox instanceof Array
        ? req.query.bbox
        : `${req.query.bbox}`.replace(/[^0-9,.]+/g, '').split(',')
    ).map((s) => asNumber(s)) as GeoJSON.BBox;

    // console.info(`bbox: ${JSON.stringify(bbox)}`);
    if (
      !(bbox instanceof Array) ||
      !(bbox.length == 4 || bbox.length == 6) ||
      bbox.filter((s) => Number.isNaN(Number.parseFloat(`${s}`))).length > 0
    ) {
      res
        .status(400)
        .json({ error: 'Bounding box array items must be of type number' });
      return;
    }

    // bbox is southwest x and y then northeast x and y
    // x = lng
    // y = lat
    const [swX, swY, neX, neY] =
      bbox.length == 6 ? [bbox[0], bbox[1], bbox[3], bbox[4]] : bbox;
    // bbox should be valid
  } catch (err) {
    res.status(400).json({ error: `Bounding Box is invalid` });
    console.warn(`invalid bbox supplied: ${err} ${(err as Error).stack}`);
    return;
  }
  // console.info(`loading geojson for ${pos} with radius ${radius}`);
  const featureCollection = await exportSpreadsheetGeoJson(
    `${req.query.spreadsheetId}`,
    `${req.query.range}`
  );
  res.status(200).json(featureCollection);
}
