import { google } from "googleapis";
import { defaultGeoPosition, GeoPosition } from "../../../common/geo";

export async function searchPlace(
  query: string,
  {
    position,
  }: {
    position?: GeoPosition;
  } = {}
) {
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });

  const places = google.places({ version: "v1", auth });

  const result = (
    await places.places.searchText({
      fields:
        // "places(id,formattedAddress,internationalPhoneNumber,location,googleMapsUri,iconBackgroundColor,displayName(text))",
        "*",

      requestBody: {
        maxResultCount: 3,
        languageCode: "de",
        textQuery: query,
        locationBias: {
          circle: {
            center: {
              latitude: (position || defaultGeoPosition).lat,
              longitude: (position || defaultGeoPosition).lng,
            },
            radius: 30000,
          },
        },
      },
    })
  ).data.places;

  return result;
}
