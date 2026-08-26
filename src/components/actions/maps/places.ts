import haversine from 'haversine-distance';
import { defaultGeoPosition, GeoPosition } from '../../../common/geo';
import { OSMPlace } from '../../../common/osm';

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';

interface SearchOptions {
  /**
   * Sortiert die Treffer nach Entfernung zu dieser Position. Ohne Sortierung
   * bleibt die Reihenfolge von Nominatim (nach `importance`) erhalten — das ist
   * bei einer strukturierten, auf einen Ort eingeschränkten Suche das bessere
   * Kriterium, weil sonst ein gleichnamiger Treffer in der Nähe von Neusiedl
   * den eigentlich gesuchten Ort verdrängt.
   *
   * `null` schaltet die Sortierung ausdrücklich ab, auch dort wo `undefined`
   * eine Vorgabe einsetzt (siehe `searchPlace`).
   */
  position?: GeoPosition | null;
  maxResults?: number;
}

/** Strukturierte Adressfelder der Nominatim-Suche. */
export interface StructuredAddress {
  street?: string;
  city?: string;
  postalcode?: string;
  /** Vorgabe: Österreich. */
  country?: string;
}

async function fetchPlaces(
  params: Record<string, string>,
  { position, maxResults = 3 }: SearchOptions
): Promise<OSMPlace[]> {
  const uri = `${NOMINATIM_SEARCH_URL}?${new URLSearchParams({
    ...params,
    format: 'jsonv2',
    limit: '10',
  })}`;
  // console.info(`uri: ${uri}`);
  const result = await fetch(uri, {
    headers: {
      'User-Agent': 'Einsatzkarte https://einsatz.ffnd.at',
      Accept: 'application/json',
    },
  });

  const bodyText = await result.text();
  if (result.status !== 200) {
    throw new Error(`Geocoding failed ${result.status} ${bodyText}`);
  }

  // console.info(`geocoding result: ${result.status} ${bodyText}`);
  const results: OSMPlace[] = JSON.parse(bodyText);

  if (position) {
    results.forEach(
      (p) =>
        (p.distance = haversine(
          { lat: Number.parseFloat(p.lat), lon: Number.parseFloat(p.lon) },
          position.toGeoObject()
        ))
    );
    results.sort((a, b) => (a.distance || 0) - (b.distance || 0));
  }

  return results.slice(0, maxResults);
}

/**
 * Freitextsuche. Ohne `position` wird nach Nähe zu Neusiedl am See sortiert;
 * `position: null` schaltet die Sortierung ab und übernimmt die Reihenfolge von
 * Nominatim.
 */
export async function searchPlace(
  query: string,
  { position, maxResults = 3 }: SearchOptions = {}
) {
  return fetchPlaces(
    { q: `${query}, Österreich` },
    {
      position: position === undefined ? defaultGeoPosition : position,
      maxResults,
    }
  );
}

/**
 * Adresssuche mit den strukturierten Feldern von Nominatim. Anders als
 * `searchPlace` bekommt Nominatim den Ort als eigenen Parameter und kann die
 * Treffer selbst darauf einschränken, statt ihn nur als Freitext neben der
 * Straße zu sehen. `q` darf laut Nominatim-API nicht mit den strukturierten
 * Feldern gemischt werden, deshalb die getrennte Funktion.
 */
export async function searchAddress(
  address: StructuredAddress,
  { position, maxResults = 3 }: SearchOptions = {}
) {
  const params: Record<string, string> = { country: 'Österreich' };
  for (const key of ['street', 'city', 'postalcode', 'country'] as const) {
    const value = address[key]?.trim();
    if (value) {
      params[key] = value;
    }
  }

  return fetchPlaces(params, { position, maxResults });
}
