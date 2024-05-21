import type { NextApiRequest, NextApiResponse } from "next";
import { ErrorResponse } from "./responses";
import userRequired from "../../server/auth/userRequired";
import { searchPlace } from "../../components/actions/maps/places";
import { places_v1 } from "googleapis/build/src/apis/places/v1";

type PlacesResponse = {
  places?: places_v1.Schema$GoogleMapsPlacesV1Place[];
};

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
  const places = await searchPlace(req.body.query);
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
