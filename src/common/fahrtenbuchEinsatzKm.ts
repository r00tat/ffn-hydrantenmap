/**
 * Die gefahrenen Kilometer je Fahrzeug eines Einsatzes — aus dem Fahrtenbuch,
 * nachgeschlagen über den Fahrzeugnamen der Einsatzkarte.
 *
 * Gebraucht wird das dort, wo ein Fremdsystem die Kilometer eines Einsatzes
 * erwartet und nur die Fahrzeugnamen der Einsatzkarte kennt — derzeit der
 * SYBOS-Einsatzbericht der Chrome-Extension, der vorher pauschal 5 km je
 * Fahrzeug eingetragen hat.
 *
 * Reine Funktion, ohne Firestore und React: Dieselbe Rechnung soll im
 * Service Worker der Extension laufen und in einem Test nachprüfbar sein.
 * Deshalb kommen Stammdaten und Fahrten als Argumente herein.
 */

import {
  matchVehicleByName,
  type FahrtenbuchEntry,
  type FahrtenbuchVehicle,
} from './fahrtenbuch';
import { counterDiffsByUnit } from './fahrtenbuchStats';

/** Einheit des Kilometerzählers, wie in den Zähler-Presets vergeben. */
const DISTANCE_UNIT = 'km';

/**
 * Warum es zu einem Fahrzeug keine Kilometer gibt. Die drei Fälle sind
 * bewusst unterschieden: Bei `noVehicle` steht der Name in den Stammdaten
 * anders (ein Fehler, den jemand beheben kann), bei `noCounter` gibt es
 * nichts zu holen (Anhänger, Boot), bei `noEntry` fehlt die Fahrt.
 */
export type EinsatzKmMissing = 'noVehicle' | 'noEntry' | 'noCounter';

export interface EinsatzVehicleKm {
  /** Der übergebene Name, unverändert — der Aufrufer erkennt seine Zeile daran. */
  name: string;
  /** Gefahrene Kilometer; `undefined`, wenn `missing` gesetzt ist. */
  km?: number;
  /** Gesetzt, wenn keine Kilometer zu ermitteln waren. */
  missing?: EinsatzKmMissing;
}

export interface EinsatzKmSource {
  firecallId: string;
  /** Fahrtenbuch-Stammdaten der Gruppe. */
  vehicles: FahrtenbuchVehicle[];
  /** Fahrten der Gruppe; gefiltert wird hier. */
  entries: FahrtenbuchEntry[];
}

/**
 * Zu jedem übergebenen Fahrzeugnamen die Kilometer dieses Einsatzes.
 *
 * Mehrere Fahrten desselben Fahrzeugs zu einem Einsatz werden **summiert**.
 * Die Sammelerfassung legt je Fahrzeug genau eine Fahrt an, eine zweite kommt
 * nur von Hand dazu (Nachschub, zweite Anfahrt) — und dann sind die
 * Einsatzkilometer die Summe, nicht die der ersten gefundenen Fahrt.
 *
 * Die Rückgabe hat dieselbe Länge und Reihenfolge wie `vehicleNames`; ein
 * Name ohne Kilometer verschwindet nicht, sondern trägt ein `missing`. Ein
 * stilles Weglassen wäre hier der Fehler: Der Aufrufer soll melden können,
 * für welche Fahrzeuge nichts zu holen war, statt einen Wert zu raten.
 */
export function resolveEinsatzVehicleKilometers(
  vehicleNames: string[],
  source: EinsatzKmSource,
): EinsatzVehicleKm[] {
  const { firecallId, vehicles, entries } = source;

  return vehicleNames.map((name) => {
    const groupVehicle = matchVehicleByName(vehicles, name);
    if (!groupVehicle?.id) return { name, missing: 'noVehicle' };

    const vehicleId = groupVehicle.id;
    const tripEntries = entries.filter(
      (entry) =>
        !entry.deleted &&
        entry.firecallId === firecallId &&
        entry.vehicleId === vehicleId,
    );
    if (tripEntries.length === 0) return { name, missing: 'noEntry' };

    let km: number | undefined;
    for (const entry of tripEntries) {
      const distance = counterDiffsByUnit(entry, groupVehicle)[DISTANCE_UNIT];
      if (distance === undefined) continue;
      km = (km ?? 0) + distance;
    }

    // Kein Kilometerzähler am Fahrzeug (Anhänger, Boot) oder ein Zähler, den
    // niemand ausgefüllt hat — für den Aufrufer dasselbe: nichts einzutragen.
    if (km === undefined) return { name, missing: 'noCounter' };

    return { name, km };
  });
}
