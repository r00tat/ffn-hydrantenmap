import { FirecallLocation } from '../firebase/firestore';

/**
 * Die Texte der Einsatztagebuch-Einträge rund um Einsatzorte.
 *
 * An einer Stelle, weil Einsatzorte an mehreren Orten angelegt und mit Kräften
 * belegt werden — Seite „Einsatzorte", Dialog des Einsatzorts, Stärketabelle
 * der Seite „Einsatzmittel", Karte — und das Tagebuch überall dieselbe Zeile
 * zeigen soll. Die Texte sind Daten im Tagebuch und bleiben deshalb deutsch.
 */

export function getLocationDisplayName(
  location: Partial<FirecallLocation>,
): string {
  return (
    location.name ||
    [location.street, location.number, location.city]
      .filter(Boolean)
      .join(' ') ||
    'Unbekannt'
  );
}

export function locationCreatedEntry(location: Partial<FirecallLocation>): {
  name: string;
  beschreibung: string;
} {
  return {
    name: `Einsatzort ${getLocationDisplayName(location)} angelegt`,
    beschreibung: location.status ? `Status: ${location.status}` : '',
  };
}

export function vehicleAssignedEntry(
  vehicleName: string,
  location: Partial<FirecallLocation>,
): string {
  return `${vehicleName} zu Einsatzort ${getLocationDisplayName(location)} zugeordnet`;
}

export function vehicleRemovedEntry(
  vehicleName: string,
  location: Partial<FirecallLocation>,
): string {
  return `${vehicleName} von Einsatzort ${getLocationDisplayName(location)} abgezogen`;
}
