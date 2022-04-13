// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { distanceBetween } from 'geofire-common';
import type { NextApiRequest, NextApiResponse } from 'next';
import exportGeoJson, { GeoJsonFeatureColleaction } from '../../server/geojson';
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
  let pos = [asNumber(req.query.lat), asNumber(req.query.lng)];
  let radius = asNumber(req.query.radius);
  if (req.query.bbox) {
    try {
      let bbox: GeoJSON.BBox =
        req.query.bbox instanceof Array
          ? req.query.bbox.map((s) => asNumber(s))
          : JSON.parse(`${req.query.bbox}`);

      // console.info(`bbox: ${JSON.stringify(bbox)}`);
      if (
        !(bbox instanceof Array) ||
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
      const [swX, swY, neX, neY] = bbox;
      // bbox should be valid
      radius = (distanceBetween([swY, swX], [neY, neX]) * 1000) / 2;
      // quick hack
      pos = [(neY + swY) / 2, (neX + neX) / 2];
    } catch (err) {
      res.status(400).json({ error: `Bounding Box is invalid` });
      console.warn(`invalid bbox supplied: ${err} ${(err as Error).stack}`);
      return;
    }
  }
  // console.info(`loading geojson for ${pos} with radius ${radius}`);
  const featureCollection = await exportGeoJson(pos, radius);
  res.status(200).json(featureCollection);
}
