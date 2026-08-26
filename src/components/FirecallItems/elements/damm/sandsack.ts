'use client';

import type { Line } from '../../../firebase/firestore';
import { calculateDistance } from '../connection/distance';
import { connectionDisplayPositions } from '../connection/streetRouting';
import {
  DAMM_BAUWEISEN,
  DAMM_DEFAULTS,
  nachTabelle,
  SACK_FORMATE,
  sandsackBedarf,
  type DammBauweise,
  type DammVorgabe,
  type SackFormat,
  type SandsackBedarf,
} from './sandsackBedarf';

/**
 * Die Fassade: liest die Felder einer Dammlinie und liefert das fertige
 * Ergebnis für Karte und Dialog. Gerechnet wird in `sandsackBedarf.ts`, das
 * ohne Karte auskommt und deshalb auch serverseitig läuft.
 */
export * from './sandsackBedarf';

/** Die aufgefüllten Parameter einer Dammlinie. */
export interface DammbauParams {
  dammHoehe: number;
  freibord: number;
  dammBauweise: DammBauweise;
  dammVorgabe: DammVorgabe;
  /**
   * Basisbreite je m Höhe. `undefined` heißt: aus der Verlegetabelle rechnen.
   *
   * Ein gesetzter Wert ist die Handeingabe und schaltet auf die Geometrie um —
   * dasselbe Muster wie die Handeingabe des Höhenunterschieds bei der
   * Löschwasserförderung.
   */
  dammBoeschung?: number;
  sackFormat: string;
  sackFuellgrad: number;
  sandDichte: number;
  dammReserve: number;
  dammPersonal: number;
  dammZielzeit: number;
  fuellTrichter: boolean;
  saeckeRoedeln: boolean;
  transportWeite: number;
  lkwNutzlast: number;
  fuellLeistung?: number;
  transportLeistung?: number;
  verbauLeistung?: number;
}

/** Eine Zahl aus dem Feld, oder die Vorbelegung. Nur endliche Werte zählen. */
const numberOr = (value: number | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const positiveOr = (value: number | undefined, fallback: number): number =>
  Math.max(0, numberOr(value, fallback));

/** Ein gesetzter Wert, oder `undefined`. Unbrauchbare Eingaben zählen nicht. */
const optionalNumber = (value: number | undefined): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;

export function dammbauParams(item: Line): DammbauParams {
  const format = item.sackFormat;
  const bauweise = item.dammBauweise;
  const vorgabe = item.dammVorgabe;
  return {
    dammHoehe: positiveOr(item.dammHoehe, DAMM_DEFAULTS.dammHoehe),
    freibord: positiveOr(item.freibord, DAMM_DEFAULTS.freibord),
    dammBauweise:
      bauweise && DAMM_BAUWEISEN.includes(bauweise)
        ? bauweise
        : DAMM_DEFAULTS.dammBauweise,
    dammVorgabe:
      vorgabe === 'personal' || vorgabe === 'zeit'
        ? vorgabe
        : DAMM_DEFAULTS.dammVorgabe,
    dammBoeschung: optionalNumber(item.dammBoeschung),
    sackFormat:
      format && SACK_FORMATE[format] ? format : DAMM_DEFAULTS.sackFormat,
    sackFuellgrad: positiveOr(item.sackFuellgrad, DAMM_DEFAULTS.sackFuellgrad),
    sandDichte: positiveOr(item.sandDichte, DAMM_DEFAULTS.sandDichte),
    dammReserve: positiveOr(item.dammReserve, DAMM_DEFAULTS.dammReserve),
    dammPersonal: positiveOr(item.dammPersonal, DAMM_DEFAULTS.dammPersonal),
    dammZielzeit: positiveOr(item.dammZielzeit, DAMM_DEFAULTS.dammZielzeit),
    fuellTrichter: item.fuellTrichter === 'true',
    saeckeRoedeln: item.saeckeRoedeln === 'true',
    transportWeite: positiveOr(
      item.transportWeite,
      DAMM_DEFAULTS.transportWeite
    ),
    lkwNutzlast: positiveOr(item.lkwNutzlast, DAMM_DEFAULTS.lkwNutzlast),
    fuellLeistung: optionalNumber(item.fuellLeistung),
    transportLeistung: optionalNumber(item.transportLeistung),
    verbauLeistung: optionalNumber(item.verbauLeistung),
  };
}

/** Ob der Sandsackrechner an dieser Linie aktiv ist. */
export const isDammbauEnabled = (item: Line): boolean =>
  item.dammbau === 'true';

export interface DammbauView {
  params: DammbauParams;
  /** Länge der gezeichneten Linie in m. */
  laenge: number;
  format: SackFormat;
  bedarf: SandsackBedarf;
}

/**
 * Das Ergebnis für eine Dammlinie, oder `undefined`, wenn der Rechner nicht
 * aktiv ist.
 *
 * `overrides` erlaubt dem Panel, mit geänderten Werten zu rechnen, ohne sie
 * vorher zu speichern — das ist der Zweck des Reglers: sehen, wie die Sackzahl
 * auf 20 cm mehr Dammhöhe reagiert.
 */
export function dammbauView(
  item: Line,
  overrides: Partial<DammbauParams> = {}
): DammbauView | undefined {
  if (!isDammbauEnabled(item)) return undefined;

  const params = { ...dammbauParams(item), ...overrides };
  const format = SACK_FORMATE[params.sackFormat] ?? SACK_FORMATE['30x60'];
  const laenge = calculateDistance(connectionDisplayPositions(item));

  return {
    params,
    laenge,
    format,
    bedarf: sandsackBedarf({
      laenge,
      hoehe: params.dammHoehe,
      bauweise: params.dammBauweise,
      boeschung: params.dammBoeschung,
      format,
      fuellgrad: params.sackFuellgrad,
      sandDichte: params.sandDichte,
      reserve: params.dammReserve,
      vorgabe: params.dammVorgabe,
      personal: params.dammPersonal,
      zielzeit: params.dammZielzeit,
      trichter: params.fuellTrichter,
      roedeln: params.saeckeRoedeln,
      transportWeite: params.transportWeite,
      lkwNutzlast: params.lkwNutzlast,
      freibord: params.freibord,
      fuellLeistung: params.fuellLeistung,
      transportLeistung: params.transportLeistung,
      verbauLeistung: params.verbauLeistung,
    }),
  };
}

const round = (value: number, digits = 1): number =>
  Math.round(value * 10 ** digits) / 10 ** digits;

/**
 * Die Zeile für Kartenpopup und Elementliste, oder `undefined` ohne aktiven
 * Rechner bzw. ohne gezeichnete Strecke.
 */
export function dammbauSummary(item: Line): string | undefined {
  const view = dammbauView(item);
  if (!view || view.bedarf.saecke <= 0) return undefined;
  return `Damm ${round(view.params.dammHoehe, 2)} m: ${
    view.bedarf.saecke
  } Sandsäcke, ${Math.round(view.bedarf.sandMasse)} t Sand`;
}
