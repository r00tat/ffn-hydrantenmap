import {
  collectWaterSupplyCandidates,
  type WaterSupplyCandidate,
} from '../../../../../common/waterSupply';
import type { GeohashCluster } from '../../../../../common/gis-objects';
import type { GeoPositionObject } from '../../../../../common/geo';

/**
 * Die Ergiebigkeit der Entnahmestelle, an der die Fahrzeuge füllen.
 *
 * Reine Zahlen und Datenaufbereitung: kein Firestore, kein React. Die Abfrage
 * macht der Hook daneben.
 *
 * Warum überhaupt: Der Rechner hat die Füllzeit einmal als festen Wert von
 * 4 Minuten angenommen. Das war stillschweigend die Behauptung „500 l/min an
 * jeder Entnahmestelle" — eine Zahl, die aus nichts folgt und die Menge des
 * ganzen Pendelverkehrs deckelt. Steht ein Hydrant in Reichweite, sagen die
 * GIS-Daten, was er hergibt; steht keiner, wird gefragt statt geraten. Siehe
 * docs/pendelverkehr.md.
 */

/**
 * Bis hierher gilt ein Hydrant als der Füllplatz dieser Leitung.
 *
 * 100 m ist die Weite, in der ein Fahrzeug noch am Hydranten steht und nicht
 * erst hinfährt. Weiter weg wäre es eine eigene Fahrstrecke, die in der
 * Umlaufzeit fehlt.
 */
export const FUELLSTELLE_RADIUS = 100;

/**
 * Die Leistungsangabe des GIS-Imports als Zahl in l/min.
 *
 * Das Feld ist Freitext („1074", „800 l/min", „ca. 600", „1.200"). Gelesen wird
 * die erste Zahl; ein Feld ohne Zahl gilt als unbekannt und führt zur Eingabe,
 * nicht zu einem geratenen Wert.
 *
 * **Tausendertrennung zuerst.** Ein Punkt oder Komma mit genau drei Ziffern
 * dahinter ist im deutschen Zahlenformat eine Tausendertrennung, kein
 * Dezimaltrenner: „1.200" sind 1200 l/min und nicht 1,2. Ohne diesen Schritt
 * las der Rechner an einem starken Hydranten die schwächste Leistung im
 * Datensatz — und deckelte den ganzen Pendelverkehr darauf.
 */
export function parseLeistung(value?: string | number): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }
  if (!value) return undefined;

  const normalised = value
    .replace(/(\d)[.,](\d{3})(?!\d)/g, '$1$2')
    .replace(',', '.');

  const match = /(\d+(?:\.\d+)?)/.exec(normalised);
  if (!match) return undefined;

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export interface Fuellstelle {
  /** Name des Hydranten aus dem GIS-Import. */
  name: string;
  /** Luftlinie zur Entnahmestelle in m. */
  distance: number;
  /** Ergiebigkeit in l/min. */
  leistung: number;
}

/**
 * Der nächste Hydrant **mit** Leistungsangabe innerhalb des Radius, oder
 * `undefined`.
 *
 * Ein näherer Hydrant ohne Leistungsangabe verdrängt keinen weiter entfernten
 * mit: Gesucht ist die Zahl, nicht der Hydrant. Nur Hydranten — eine Saugstelle
 * oder ein Löschteich tragen ihre Ergiebigkeit in anderen Feldern und sind ein
 * eigener Fall, siehe docs/pendelverkehr.md.
 */
export function nearestFuellstelle(
  clusters: GeohashCluster[],
  target: GeoPositionObject,
  radius = FUELLSTELLE_RADIUS
): Fuellstelle | undefined {
  const candidates: WaterSupplyCandidate[] = collectWaterSupplyCandidates(
    clusters,
    target,
    { radius, kinds: ['hydrant'] }
  );

  for (const candidate of candidates) {
    const leistung = parseLeistung(candidate.leistung);
    if (leistung !== undefined) {
      return {
        name: candidate.name,
        distance: candidate.distance,
        leistung,
      };
    }
  }

  return undefined;
}
