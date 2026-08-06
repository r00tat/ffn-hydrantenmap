import haversine from 'haversine-distance';
import type { CounterDefinition, CounterReading, CounterSource } from './fahrtenbuch';
import type { GeoPositionObject } from './geo';

/**
 * Umwegfaktor für die Luftlinien-Schätzung. Die Schätzung dient dem Hinweis im
 * Formular und — wenn kein Routing zu bekommen ist — als Rückfallebene für den
 * gespeicherten Wert. Dann wird sie als `'estimate'` gekennzeichnet.
 */
const DETOUR_FACTOR = 1.3;

/**
 * Ganze Kilometer aus einer Streckenlänge in Metern. Aufgerundet statt
 * kaufmännisch gerundet, weil Rangieren am Einsatzort zusätzliche Meter kostet.
 */
export function totalKmFromMeters(totalMeters: number): number {
  return Math.ceil(totalMeters / 1000);
}

/**
 * Grobe Gesamtstrecke aus der Luftlinie — für den Hinweis im Formular und als
 * Rückfallebene ohne Routing. Hier wird verdoppelt, weil die Luftlinie in beide
 * Richtungen dieselbe ist: Eine Schätzung kann den Unterschied zwischen Hin-
 * und Rückweg nicht kennen, eine gemessene Route schon (siehe
 * `routeDistance`).
 */
export function estimateRoundTripKm(
  from: GeoPositionObject,
  to: GeoPositionObject,
): number {
  return totalKmFromMeters(2 * haversine(from, to) * DETOUR_FACTOR);
}

/**
 * Ob `def` der Kilometerzähler ist. Die Einheit wird von Hand eingetippt und
 * daher nur als zweites Signal herangezogen — die Preset-ID ist verlässlicher
 * und fängt auch Schreibweisen wie „Kilometer" ab.
 */
export function isKmCounter(def: CounterDefinition): boolean {
  if (def.mode !== 'startEnd') return false;
  return def.id === 'km' || def.unit.trim().toLowerCase() === 'km';
}

/** Ein Endstand macht ein mitgeschlepptes `diff` ungültig. */
function withEnd(reading: CounterReading | undefined, end: number): CounterReading {
  const { diff: _diff, ...rest } = reading ?? {};
  return { ...rest, end };
}

export interface AutoFilledCounters {
  counters: Record<string, CounterReading>;
  /** Nur die Zähler, deren Endstand hier ergänzt wurde. */
  counterSources: Record<string, CounterSource>;
}

/**
 * Die Gesamtstrecke samt ihrer Herkunft. Beides gehört zusammen: Die Zahl
 * allein sagt nicht, ob sie gefahren oder geschätzt ist, und genau diese
 * Unterscheidung landet als `CounterSource` im Nachweisdokument.
 */
export interface RoundTripDistance {
  /** Gesamtstrecke (Hin- und Rückweg) in ganzen Kilometern. */
  roundTripKm: number;
  source: 'route' | 'estimate';
  /**
   * Gemessener Hinweg (Feuerwehrhaus → Einsatzort) in Metern — nur bei
   * `'route'`. Eine Schätzung hat hier bewusst nichts stehen: Die
   * Routenfelder am Eintrag sind die Belegstelle für eine gefahrene Strecke,
   * keine Ablage für Rechenzwischenwerte.
   */
  outboundMeters?: number;
  /** Gemessener Rückweg (Einsatzort → Feuerwehrhaus) in Metern — nur bei `'route'`. */
  returnMeters?: number;
}

/**
 * Aus zwei gemessenen Straßenstrecken in Metern.
 *
 * Hin- und Rückweg werden getrennt gemessen und addiert, statt den Hinweg zu
 * verdoppeln. Im Ortsgebiet macht das keinen Unterschied; bei einem Einsatz auf
 * der Autobahn schon — dort führt der Rückweg über die nächste Abfahrt und kann
 * um Kilometer vom Hinweg abweichen. Ein verdoppelter Hinweg wäre dann ein
 * falscher Kilometerstand in einem Nachweisdokument.
 */
export function routeDistance(
  outboundMeters: number,
  returnMeters: number,
): RoundTripDistance {
  return {
    roundTripKm: totalKmFromMeters(outboundMeters + returnMeters),
    source: 'route',
    outboundMeters,
    returnMeters,
  };
}

/** Aus der Luftlinie geschätzt, weil kein Routing zu bekommen war. */
export function estimatedDistance(
  from: GeoPositionObject,
  to: GeoPositionObject,
): RoundTripDistance {
  return { roundTripKm: estimateRoundTripKm(from, to), source: 'estimate' };
}

/**
 * Ergänzt fehlende Endstände. Ein vom Benutzer eingetragener Wert hat immer
 * Vorrang und wird nie überschrieben.
 *
 * Diese Funktion ist der einzige Ort, an dem die Regel steht. Der Client ruft
 * sie mit der Luftlinien-Schätzung auf, um zu entscheiden, ob eine Zeile
 * speicherbar ist; die Server Action ruft sie mit der echten Route auf, um die
 * Werte zu schreiben. Gäbe es die Regel zweimal, würden beide Seiten
 * auseinanderdriften und der Benutzer bekäme Zeilen zu sehen, die der Server
 * ablehnt.
 */
export function autoFillCounterEnds(
  definitions: CounterDefinition[],
  counters: Record<string, CounterReading>,
  lastCounters: Record<string, number>,
  distance?: RoundTripDistance,
): AutoFilledCounters {
  const result: Record<string, CounterReading> = { ...counters };
  const counterSources: Record<string, CounterSource> = {};

  for (const def of definitions) {
    const reading = counters[def.id];
    if (reading?.end !== undefined) continue;

    if (isKmCounter(def)) {
      // Ohne Startstand fehlt der Bezugswert, zu dem die Strecke addiert
      // werden könnte.
      if (!distance || reading?.start === undefined) continue;
      result[def.id] = withEnd(reading, reading.start + distance.roundTripKm);
      // Die Herkunft kommt aus der Distanz und wird hier nicht erfunden: Ruft
      // der Client die Funktion mit seiner Schätzung auf, steht dort
      // `'estimate'`. Gespeichert wird das Ergebnis ohnehin nur von der Server
      // Action — der Client nutzt es zur Vorprüfung und schickt den Endstand
      // leer mit.
      counterSources[def.id] = distance.source;
      continue;
    }

    // „Unverändert" heißt bei Start/Ende-Zählern: Der Endstand entspricht dem
    // Startstand dieser Fahrt. Der Fahrzeug-Cache taugt dafür nicht — er
    // driftet, sobald eine Fahrt nicht erfasst wurde, und ein korrigierter
    // Startstand ergäbe dann einen Endstand darunter.
    if (def.mode === 'startEnd') {
      if (reading?.start === undefined) continue;
      result[def.id] = withEnd(reading, reading.start);
      counterSources[def.id] = 'unchanged';
      continue;
    }

    // Ein Ablesezähler hat keinen Startwert; der letzte bekannte Stand ist die
    // einzige belegbare Annahme.
    const last = lastCounters[def.id];
    if (last === undefined) continue;
    result[def.id] = withEnd(reading, last);
    counterSources[def.id] = 'unchanged';
  }

  return { counters: result, counterSources };
}
