import { searchPlace } from '../actions/maps/places';
import { defaultGeoPosition } from '../../common/geo';

export async function geocodeAddress(
  street: string,
  number: string,
  city: string
): Promise<{ lat: number; lng: number } | null> {
  if (!street || !number) {
    return null;
  }

  const query = `${street} ${number}, ${city}`;

  try {
    const results = await searchPlace(query, {
      position: defaultGeoPosition,
      maxResults: 1,
    });

    if (results.length > 0) {
      return {
        lat: parseFloat(results[0].lat),
        lng: parseFloat(results[0].lon),
      };
    }
  } catch (error) {
    console.error('Geocoding failed:', error);
  }

  return null;
}
