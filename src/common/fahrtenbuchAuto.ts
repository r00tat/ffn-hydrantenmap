import haversine from 'haversine-distance';
import type { CounterDefinition, CounterReading } from './fahrtenbuch';
import type { GeoPositionObject } from './geo';

/**
 * Umwegfaktor für die Luftlinien-Schätzung. Nur für Anzeige und Vorprüfung —
 * gespeichert wird immer die echte Routendistanz.
 */
export const DETOUR_FACTOR = 1.3;

export type CounterSource = 'route' | 'unchanged';

/**
 * Rundstrecke in ganzen Kilometern aus der einfachen Strecke in Metern. Das
 * Fahrzeug kehrt ins Feuerwehrhaus zurück, deshalb die Verdopplung. Aufgerundet
 * statt kaufmännisch gerundet, weil Rangieren am Einsatzort zusätzliche Meter
 * kostet.
 */
export function roundTripKmFromMeters(distanceM: number): number {
  return Math.ceil((2 * distanceM) / 1000);
}

/** Grobe Rundstrecke aus der Luftlinie — für den Hinweis im Formular. */
export function estimateRoundTripKm(
  from: GeoPositionObject,
  to: GeoPositionObject,
): number {
  return roundTripKmFromMeters(haversine(from, to) * DETOUR_FACTOR);
}

/**
 * Ein Kilometerzähler. Die Einheit wird getrimmt und ohne Rücksicht auf Groß-
 * und Kleinschreibung verglichen — Zähler werden von Hand angelegt, `KM` und
 * `km` müssen dasselbe bedeuten.
 */
export function isKmCounter(def: CounterDefinition): boolean {
  return def.mode === 'startEnd' && def.unit.trim().toLowerCase() === 'km';
}

export interface AutoFilledCounters {
  counters: Record<string, CounterReading>;
  /** Nur die Zähler, deren Endstand hier ergänzt wurde. */
  counterSources: Record<string, CounterSource>;
}

/**
 * Ergänzt fehlende Endstände. Ein vom Benutzer eingetragener Wert hat immer
 * Vorrang und wird nie überschrieben.
 *
 * Diese Funktion ist der einzige Ort, an dem die Regel steht. Der Client ruft
 * sie mit der Luftlinien-Schätzung auf, um zu entscheiden, ob eine Zeile
 * speicherbar ist; die Server Action ruft sie mit der echten Route auf, um die
 * Werte zu schreiben. Läge die Regel zweimal vor, drifteten beide Seiten
 * auseinander und der Benutzer bekäme Zeilen zu sehen, die der Server ablehnt.
 */
export function autoFillCounterEnds(
  definitions: CounterDefinition[],
  counters: Record<string, CounterReading>,
  lastCounters: Record<string, number>,
  roundTripKm?: number,
): AutoFilledCounters {
  const result: Record<string, CounterReading> = { ...counters };
  const counterSources: Record<string, CounterSource> = {};

  for (const def of definitions) {
    const reading = counters[def.id];
    if (reading?.end !== undefined) continue;

    if (isKmCounter(def)) {
      // Ohne Startstand gibt es nichts, worauf sich die Strecke addieren ließe.
      if (roundTripKm === undefined || reading?.start === undefined) continue;
      result[def.id] = { ...reading, end: reading.start + roundTripKm };
      counterSources[def.id] = 'route';
      continue;
    }

    // Betriebsstunden und Ablesezähler lassen sich aus einer Strecke nicht
    // ableiten. Der letzte bekannte Stand ist die einzige belegbare Annahme.
    const last = lastCounters[def.id];
    if (last === undefined) continue;
    result[def.id] = { ...reading, end: last };
    counterSources[def.id] = 'unchanged';
  }

  return { counters: result, counterSources };
}
