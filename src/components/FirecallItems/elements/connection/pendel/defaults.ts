/**
 * Vorbelegungen des Pendelverkehrs — **ohne Karte und ohne React**, aus
 * demselben Grund wie `../foerderung/defaults.ts`.
 */
import { FOERDERUNG_DEFAULTS } from '../foerderung/defaults';

/**
 * Vorbelegungen. Herkunft je Wert in docs/pendelverkehr.md — es sind
 * Planungswerte, keine Tabellenwerte.
 */
export const PENDEL_DEFAULTS = {
  /** Zwei Tanklöschfahrzeuge sind der kleinste Pendelverkehr, der einer ist. */
  fahrzeuge: 2,
  /** Untere Klasse der Tarifordnung („Tanklöschfahrzeug bis 2.000 l"). */
  tankinhalt: 2000,
  /** Einsatzfahrt mit vollem Tank, gemischt Ortsgebiet und Freiland. */
  geschwindigkeit: 40,
  /** An- und Abfahren an der Entnahmestelle, Kupplen inbegriffen. */
  rangierzeit: 1,
  /** 2000 l über die eigene Pumpe plus Anfahren. */
  entleerzeit: 3,
};
