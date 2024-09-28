import haversine from 'haversine-distance';
import { defaultGeoPosition, GeoPosition } from '../../../common/geo';
import { OSMPlace } from '../../../common/osm';

export async function searchPlace(
  query: string,
  {
    position,
    maxResults = 3,
  }: {
    position?: GeoPosition;
    maxResults?: number;
  } = {}
) {
  const uri = `https://nominatim.openstreetmap.org/search?${new URLSearchParams(
    {
      q: `${query}, Österreich`,
      format: 'jsonv2',
      limit: '10',
    }
  )}`;
  // console.info(`uri: ${uri}`);
  const result = await fetch(uri, {
    headers: {
      'User-Agent': 'Einsatzkarte https://hydrant.ffnd.at',
      Accept: 'application/json',
    },
  });

  const bodyText = await result.text();
  if (result.status !== 200) {
    throw new Error(`Geocoding failed ${result.status} ${bodyText}`);
  }

  // console.info(`geocoding result: ${result.status} ${bodyText}`);
  const results: OSMPlace[] = JSON.parse(bodyText);

  results.forEach(
    (p) =>
      (p.distance = haversine(
        { lat: Number.parseFloat(p.lat), lon: Number.parseFloat(p.lon) },
        (position || defaultGeoPosition)?.toGeoObject()
      ))
  );
  results.sort((a, b) => (a.distance || 0) - (b.distance || 0));

  return results.slice(0, maxResults);
}
