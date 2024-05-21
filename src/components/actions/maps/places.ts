import { GeoPosition } from "../../../common/geo";

export async function searchPlace(
  query: string,
  {
    position,
  }: {
    position?: GeoPosition;
  } = {}
) {
  // const auth = new google.auth.GoogleAuth({
  //   scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  // });

  // const places = google.places({ version: "v1", auth });

  // const result = (
  //   await places.places.searchText({
  //     fields:
  //       // "places(id,formattedAddress,internationalPhoneNumber,location,googleMapsUri,iconBackgroundColor,displayName(text))",
  //       "*",

  //     requestBody: {
  //       maxResultCount: 3,
  //       languageCode: "de",
  //       textQuery: query,
  //       locationBias: {
  //         circle: {
  //           center: {
  //             latitude: (position || defaultGeoPosition).lat,
  //             longitude: (position || defaultGeoPosition).lng,
  //           },
  //           radius: 30000,
  //         },
  //       },
  //     },
  //   })
  // ).data.places;
  const uri = `https://nominatim.openstreetmap.org/search?${new URLSearchParams(
    {
      q: `${query}, Österreich`,
      format: "jsonv2",
      limit: "2",
    }
  )}`;
  console.info(`uri: ${uri}`);
  const result = await fetch(uri, {
    // method: "GET",

    headers: {
      "User-Agent": "Hydrantenkarte https://hydrant.ffnd.at",
      Accept: "application/json",
    },
  });

  const bodyText = await result.text();
  if (result.status !== 200) {
    throw new Error(`Geocoding failed ${result.status} ${bodyText}`);
  }

  console.info(`geocoding result: ${result.status} ${bodyText}`);
  return JSON.parse(bodyText);
}
