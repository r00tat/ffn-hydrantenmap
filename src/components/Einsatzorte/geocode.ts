import { searchAddress, searchPlace } from '../actions/maps/places';
import { defaultGeoPosition } from '../../common/geo';

/** Ort, der gilt, wenn im Einsatzort keiner eingetragen ist. */
export const DEFAULT_LOCATION_CITY = 'Neusiedl am See';

export interface AddressParts {
  street: string;
  number: string;
  city: string;
}

function trimParts(parts: Partial<AddressParts>): AddressParts {
  return {
    street: parts.street?.trim() || '',
    number: parts.number?.trim() || '',
    city: parts.city?.trim() || '',
  };
}

/**
 * Prüft, ob eine Adresse aussagekräftig genug für ein Geocoding ist, und gibt
 * sie normalisiert samt Vorgabe-Ort zurück.
 *
 * Bewusst zurückhaltend: Eine Straße ohne Hausnummer ergäbe beim Tippen im
 * Formular laufend Anfragen auf halb geschriebene Straßennamen, die den
 * Einsatzort auf einen Straßenmittelpunkt setzen würden. Ein Ort allein ist
 * dagegen brauchbar — er trifft das Ortszentrum, was für einen flächigen
 * Auftrag der richtige Startpunkt ist.
 */
export function geocodableAddress(
  parts: Partial<AddressParts>
): AddressParts | null {
  const { street, number, city } = trimParts(parts);

  if (street && number) {
    return { street, number, city: city || DEFAULT_LOCATION_CITY };
  }
  if (!street && !number && city) {
    return { street: '', number: '', city };
  }
  return null;
}

/**
 * Liefert die zu geocodierende Adresse, wenn sich gegenüber `prev` etwas
 * geändert hat — auch dann, wenn nur der **Ort** geändert wurde. Sonst `null`.
 */
export function geocodeTargetForChange(
  prev: Partial<AddressParts>,
  next: Partial<AddressParts>
): AddressParts | null {
  const target = geocodableAddress(next);
  if (!target) {
    return null;
  }

  const before = trimParts(prev);
  const after = trimParts(next);
  if (
    before.street === after.street &&
    before.number === after.number &&
    before.city === after.city
  ) {
    return null;
  }

  return target;
}

/**
 * Löst eine Einsatzort-Adresse in Koordinaten auf.
 *
 * Der Ort geht als strukturiertes Feld an Nominatim, damit eine Adresse auch
 * außerhalb von Neusiedl am See richtig getroffen wird. Nur wenn kein Ort
 * angegeben ist, dient die Nähe zu Neusiedl als Entscheidungskriterium unter
 * mehreren gleichnamigen Treffern.
 *
 * Straße, Hausnummer und Ort sind einzeln optional — es muss nur mindestens
 * Straße samt Hausnummer oder ein Ort gesetzt sein.
 */
export async function geocodeAddress(
  street: string,
  number: string,
  city: string
): Promise<{ lat: number; lng: number } | null> {
  const parts = trimParts({ street, number, city });

  if (!parts.street && !parts.city) {
    return null;
  }

  // Nominatim erwartet die Hausnummer im `street`-Feld vor dem Straßennamen.
  const streetParam = [parts.number, parts.street].filter(Boolean).join(' ');

  // Ohne Ort ist die Suche österreichweit und braucht die Nähe zu Neusiedl als
  // Tiebreaker; mit Ort würde sie den gesuchten Ort gerade überstimmen. `null`
  // statt `undefined`, weil `searchPlace` sonst wieder Neusiedl einsetzt.
  const position = parts.city ? null : defaultGeoPosition;

  const structured = await tryStructured(streetParam, parts.city, position);
  if (structured) {
    return structured;
  }

  // Fallback auf die Freitextsuche: Die strukturierte Suche findet manche
  // Hausnummern nicht (Zusätze wie „12a", Nummernbereiche), die als Freitext
  // durchaus auflösen.
  return tryFreeText(parts.street, parts.number, parts.city, position);
}

async function tryStructured(
  streetParam: string,
  city: string,
  position: GeocodePosition
) {
  try {
    const results = await searchAddress(
      {
        ...(streetParam ? { street: streetParam } : {}),
        ...(city ? { city } : {}),
      },
      { position, maxResults: 1 }
    );
    return toCoords(results);
  } catch (error) {
    console.error('Structured geocoding failed:', error);
    return null;
  }
}

async function tryFreeText(
  street: string,
  number: string,
  city: string,
  position: GeocodePosition
) {
  const query = [[street, number].filter(Boolean).join(' '), city]
    .filter(Boolean)
    .join(', ');

  try {
    const results = await searchPlace(query, { position, maxResults: 1 });
    return toCoords(results);
  } catch (error) {
    console.error('Geocoding failed:', error);
    return null;
  }
}

type GeocodePosition = typeof defaultGeoPosition | null;

function toCoords(results: { lat: string; lon: string }[]) {
  if (results.length === 0) {
    return null;
  }
  const { lat, lon } = results[0];
  return { lat: parseFloat(lat), lng: parseFloat(lon) };
}
