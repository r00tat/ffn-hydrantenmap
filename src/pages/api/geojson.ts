// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import exportGeoJson, {
  createFilterProps,
  ErrorMessage,
  GeoFilterProperties,
  GeoJsonFeatureColleaction,
} from '../../server/geojson';
import tokenRequired from '../../server/tokenRequired';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GeoJsonFeatureColleaction | ErrorMessage>
) {
  if (!(await tokenRequired(req, res))) {
    // authorization failed
    return;
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

  console.info(
    `loading geojson for ${filterProps.center} with radius ${
      filterProps.radius
    } (bbox: ${JSON.stringify(filterProps.bbox)})`
  );
  const featureCollection = await exportGeoJson(
    filterProps.center,
    filterProps.radius,
    filterProps.bbox,
    req.query.debug === 'true'
  );
  res.status(200).json(featureCollection);
}
