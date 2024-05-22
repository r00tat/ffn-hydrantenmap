import type { NextApiRequest, NextApiResponse } from "next";
import { defaultGeoPosition, GeoPosition } from "../../common/geo";
import { PlacesResponse } from "../../common/osm";
import { searchPlace } from "../../components/actions/maps/places";
import userRequired from "../../server/auth/userRequired";
import { ErrorResponse } from "./responses";

async function POST(
  req: NextApiRequest,
  res: NextApiResponse<PlacesResponse | ErrorResponse>
) {
  const authData = await userRequired(req, res);
  if (!authData) {
    return;
  }
  if (!req.body.query) {
    return res.status(400).json({ error: "Missing parameter query" });
  }
  const pos = GeoPosition.fromLatLng([
    req.body?.position?.lat || defaultGeoPosition.lat,
    req.body?.position?.lng || defaultGeoPosition.lng,
  ]);
  const places = await searchPlace(req.body.query, {
    position: pos,
    maxResults: req.body?.maxResults || 3,
  });
  return res.json({ places });
}

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<PlacesResponse | ErrorResponse>
) {
  switch (req.method) {
    case "POST":
      return POST(req, res);
    default:
      console.info(`method not found`);
      return res.status(404).json({
        error: "method not found",
      });
  }
}
