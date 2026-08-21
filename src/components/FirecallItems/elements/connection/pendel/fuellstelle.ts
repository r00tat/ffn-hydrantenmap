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

/** Ein Hydrant in Reichweite, dessen Leistung aber nicht bekannt ist. */
export interface HydrantOhneLeistung {
  name: string;
  /** Luftlinie zur Entnahmestelle in m. */
  distance: number;
}

export interface FuellstelleLookup {
  /** Der nächste Hydrant **mit** Leistungsangabe, wenn es einen gibt. */
  fuellstelle?: Fuellstelle;
  /**
   * Der nächste Hydrant überhaupt, auch ohne Leistungsangabe.
   *
   * Getrennt geführt, weil „hier steht kein Hydrant" und „hier steht einer,
   * aber seine Leistung ist nicht erfasst" zwei verschiedene Lagen sind. Die
   * erste heißt: andere Entnahmestelle suchen. Die zweite heißt: die Zahl
   * eintragen — und sie ist der Normalfall, denn `leistung` steht in keiner
   * GIS-Quelle, sondern wird von Hand gepflegt und beim CSV-Import erhalten.
   * Eine Meldung, die beides zusammenfasst, widerspricht dem, was der Melder
   * vor sich auf der Karte sieht.
   */
  naechsterHydrant?: HydrantOhneLeistung;
}

/**
 * Die Entnahmestelle in Reichweite: Leistungsangabe, wenn vorhanden, und in
 * jedem Fall der nächste Hydrant.
 *
 * Ein näherer Hydrant ohne Leistungsangabe verdrängt keinen weiter entfernten
 * mit: Gesucht ist die Zahl, nicht der Hydrant. Nur Hydranten — eine Saugstelle
 * oder ein Löschteich tragen ihre Ergiebigkeit in anderen Feldern und sind ein
 * eigener Fall, siehe docs/pendelverkehr.md.
 */
export function lookupFuellstelle(
  clusters: GeohashCluster[],
  target: GeoPositionObject,
  radius = FUELLSTELLE_RADIUS
): FuellstelleLookup {
  const candidates: WaterSupplyCandidate[] = collectWaterSupplyCandidates(
    clusters,
    target,
    { radius, kinds: ['hydrant'] }
  );

  const result: FuellstelleLookup = {};

  for (const candidate of candidates) {
    // Nach Distanz sortiert, der erste ist der nächste.
    if (!result.naechsterHydrant) {
      result.naechsterHydrant = {
        name: candidate.name,
        distance: candidate.distance,
      };
    }

    const leistung = parseLeistung(candidate.leistung);
    if (leistung !== undefined) {
      result.fuellstelle = {
        name: candidate.name,
        distance: candidate.distance,
        leistung,
      };
      break;
    }
  }

  return result;
}
