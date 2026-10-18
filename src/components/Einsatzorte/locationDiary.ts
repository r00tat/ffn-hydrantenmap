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

interface LabelledUnit {
  id?: string;
  name: string;
  fw?: string;
}

/**
 * Bezeichnung samt Feuerwehr, etwa „RLF FF Musterdorf". Im Tagebuch reicht
 * die Bezeichnung allein nicht: Stehen bei einer Übung mehrere RLF im
 * Einsatz, wäre sonst nicht nachzuvollziehen, welches gemeint ist.
 */
export function unitLabel(unit: LabelledUnit): string {
  const fw = unit.fw?.trim();
  return fw ? `${unit.name} ${fw}` : unit.name;
}

/**
 * Die Bezeichnung eines dem Einsatzort zugeordneten Elements. `vehicles` am
 * Einsatzort hält den Namen nur als Momentaufnahme vom Zeitpunkt der
 * Zuordnung — gelesen wird deshalb das aktuelle Element, der gespeicherte
 * Name dient nur als Rückfall für ein gelöschtes.
 */
export function assignedUnitLabel(
  id: string,
  storedName: string,
  units: LabelledUnit[],
): string {
  const unit = units.find((u) => u.id === id);
  return unit ? unitLabel(unit) : storedName;
}
