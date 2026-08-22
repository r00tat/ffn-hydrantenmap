'use client';

import type { Connection } from '../../../../firebase/firestore';
import type { Fuellstelle } from './fuellstelle';
import { FOERDERUNG_DEFAULTS } from '../foerderung/foerderung';
import { isPendelRelevant, isVehicleRouted, pendelDistance } from './pendelRoute';
import { computeShuttle, type ShuttleResult } from './shuttle';

/**
 * Die Fassade des Pendelverkehrs: liest die Felder einer Leitung und liefert
 * das fertige Ergebnis für Karte, Panel und Vergleich.
 *
 * Hier wird nichts gecacht. Nur die Fahrtroute ist ein Netzaufruf und liegt am
 * Element; die Umlaufrechnung ist reine Mathematik und läuft bei jedem Render
 * neu — dasselbe Muster wie bei `foerderung.ts`.
 */

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

export interface PendelParams {
  fahrzeuge: number;
  tankinhalt: number;
  geschwindigkeit: number;
  /**
   * Ergiebigkeit der Entnahmestelle in l/min. **Kein Vorgabewert**: Sie kommt
   * aus dem Hydranten in der Nähe oder von Hand — geraten wird sie nicht, das
   * war der Fehler der festen Füllzeit.
   */
  fuellleistung?: number;
  rangierzeit: number;
  entleerzeit: number;
}

export type PendelWarning =
  /** Die Linie ist nicht für ein Fahrzeug geroutet — die Länge ist die gezeichnete. */
  | 'notVehicleRouted'
  /** Die Ergiebigkeit der Entnahmestelle fehlt; ohne sie wird nicht gerechnet. */
  | 'fillRateMissing'
  /** Die Entnahmestelle deckelt die Menge, nicht die Fahrzeugzahl. */
  | 'fillStationLimited'
  /** Die geforderte Menge wird dauerhaft nicht erreicht. */
  | 'sollMengeNotReached'
  /** Zu wenig Angaben, um zu rechnen. */
  | 'notComputable';

export interface PendelView {
  params: PendelParams;
  /** Geforderte Menge an der Einsatzstelle in l/min — dieselbe wie die Förderung. */
  sollMenge: number;
  /** Einfache Fahrstrecke in m. */
  strecke: number;
  streckeSource: 'route' | 'drawn';
  /** Woher die Ergiebigkeit der Entnahmestelle kommt. */
  fuellleistungSource: 'hydrant' | 'manual' | 'unknown';
  /** Der Hydrant, aus dem sie kommt — für die Nachprüfbarkeit im Panel. */
  fuellstelle?: Fuellstelle;
  result?: ShuttleResult;
  warnings: PendelWarning[];
}

/** Eine Zahl aus dem Feld, oder die Vorbelegung. Nur endliche Werte zählen. */
const numberOr = (value: number | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** Übernimmt aus `overrides` nur, was tatsächlich gesetzt ist. */
function mergeDefined(
  base: PendelParams,
  overrides: Partial<PendelParams>
): PendelParams {
  const merged = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}

export function pendelParams(
  item: Connection,
  fuellstelle?: Fuellstelle
): PendelParams {
  return {
    // Ganze Fahrzeuge, mindestens eines: Ein halbes TLF pendelt nicht, und
    // eine Null würde die Menge auf Null ziehen, statt zu sagen, dass nichts
    // eingetragen ist.
    fahrzeuge: Math.max(
      1,
      Math.round(numberOr(item.pendelFahrzeuge, PENDEL_DEFAULTS.fahrzeuge))
    ),
    tankinhalt: numberOr(item.pendelTankinhalt, PENDEL_DEFAULTS.tankinhalt),
    geschwindigkeit: numberOr(
      item.pendelGeschwindigkeit,
      PENDEL_DEFAULTS.geschwindigkeit
    ),
    // Der eingetragene Wert gewinnt gegen den Hydranten: Wer ihn von Hand
    // gesetzt hat, hat einen Grund — gemessen, oder ein anderer Anschluss als
    // der, den die GIS-Daten in der Nähe kennen.
    fuellleistung:
      typeof item.pendelFuellleistung === 'number' &&
      Number.isFinite(item.pendelFuellleistung) &&
      item.pendelFuellleistung > 0
        ? item.pendelFuellleistung
        : fuellstelle?.leistung,
    rangierzeit: numberOr(item.pendelRangierzeit, PENDEL_DEFAULTS.rangierzeit),
    entleerzeit: numberOr(item.pendelEntleerzeit, PENDEL_DEFAULTS.entleerzeit),
  };
}

/**
 * Das Ergebnis für eine Leitung, oder `undefined`, wenn der Pendelverkehr an
 * ihr nicht gerechnet wird.
 *
 * `overrides` erlaubt dem Panel, mit geänderten Werten zu rechnen, ohne sie
 * vorher zu speichern — das ist der Zweck des Reglers: sehen, wie die Menge auf
 * die Fahrzeugzahl reagiert.
 */
export function pendelView(
  item: Connection,
  overrides: Partial<PendelParams> = {},
  sollMengeOverride?: number,
  fuellstelle?: Fuellstelle
): PendelView | undefined {
  if (!isPendelRelevant(item)) return undefined;

  // Nicht `{ ...base, ...overrides }`: Der Regler führt seinen Zustand als
  // vollständiges `PendelParams`, und darin ist die Ergiebigkeit `undefined`,
  // solange sie nicht eingetippt wurde. Ein Spread schriebe dieses `undefined`
  // über den Wert aus dem Hydranten — der Rechner sagte dann „keine
  // Ergiebigkeit", obwohl einer davor steht.
  const params = mergeDefined(pendelParams(item, fuellstelle), overrides);
  const fuellleistungSource: PendelView['fuellleistungSource'] =
    params.fuellleistung === undefined
      ? 'unknown'
      : params.fuellleistung === fuellstelle?.leistung &&
          item.pendelFuellleistung === undefined
        ? 'hydrant'
        : 'manual';
  const sollMenge =
    sollMengeOverride ??
    numberOr(item.foerderMenge, FOERDERUNG_DEFAULTS.foerderMenge);
  const warnings: PendelWarning[] = [];

  const distance = pendelDistance(item);
  if (!distance) {
    return {
      params,
      sollMenge,
      strecke: 0,
      streckeSource: 'drawn',
      fuellleistungSource,
      fuellstelle,
      warnings: ['notComputable'],
    };
  }
  if (!isVehicleRouted(item)) {
    warnings.push('notVehicleRouted');
  }
  if (params.fuellleistung === undefined) {
    warnings.push('fillRateMissing');
  }

  const result = computeShuttle({
    strecke: distance.strecke,
    geschwindigkeit: params.geschwindigkeit,
    tankinhalt: params.tankinhalt,
    fuellleistung: params.fuellleistung,
    rangierzeit: params.rangierzeit,
    entleerzeit: params.entleerzeit,
    fahrzeuge: params.fahrzeuge,
    sollMenge,
  });

  // Ohne Ergiebigkeit ist „nicht rechenbar" keine zweite Nachricht, sondern
  // dieselbe — der Hinweis darüber sagt schon, was fehlt.
  if (!result && params.fuellleistung !== undefined) {
    warnings.push('notComputable');
  }
  if (result) {
    if (result.begrenztDurchFuellstelle) warnings.push('fillStationLimited');
    if (!result.traegtSollmenge) warnings.push('sollMengeNotReached');
  }

  return {
    params,
    sollMenge,
    strecke: distance.strecke,
    streckeSource: distance.source,
    fuellleistungSource,
    fuellstelle,
    result,
    warnings,
  };
}

/**
 * Die Zeile für Kartenpopup und Elementliste, oder `undefined` ohne rechenbares
 * Ergebnis.
 */
export function pendelSummary(
  item: Connection,
  fuellstelle?: Fuellstelle
): string | undefined {
  const view = pendelView(item, {}, undefined, fuellstelle);
  if (!view?.result) return undefined;
  return `Pendelverkehr ${view.params.fahrzeuge} Fz: ${Math.round(
    view.result.menge
  )} l/min`;
}
