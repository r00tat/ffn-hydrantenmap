// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { distanceBetween } from 'geofire-common';
import type { NextApiRequest, NextApiResponse } from 'next';
import exportGeoJson, {
  BBox4,
  GeoJsonFeatureColleaction,
} from '../../server/geojson';
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
  let bbox: GeoJSON.BBox | undefined;
  if (req.query.bbox) {
    try {
      bbox = (
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
      bbox = bbox.length == 6 ? [bbox[0], bbox[1], bbox[3], bbox[4]] : bbox;
      const [swX, swY, neX, neY] = bbox;
      // bbox should be valid
      radius = (distanceBetween([swY, swX], [neY, neX]) * 1000) / 2;
      // quick hack
      pos = [(neY + swY) / 2, (swX + neX) / 2];
    } catch (err) {
      res.status(400).json({ error: `Bounding Box is invalid` });
      console.warn(`invalid bbox supplied: ${err} ${(err as Error).stack}`);
      return;
    }
  }
  console.info(
    `loading geojson for ${pos} with radius ${radius} (bbox: ${JSON.stringify(
      bbox
    )})`
  );
  const featureCollection = await exportGeoJson(
    pos,
    radius,
    bbox,
    req.query.debug === 'true'
  );
  res.status(200).json(featureCollection);
}
