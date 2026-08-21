'use client';

import type { LatLngPosition } from '../../../../../common/geo';
import type { Connection } from '../../../../firebase/firestore';
import { FOERDERUNG_DEFAULTS } from '../foerderung/foerderung';
import {
  isPendelRelevant,
  pendelDistance,
  pendelRoutedPositions,
} from './pendelRoute';
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
  /** 2000 l bei ~600 l/min plus Anfahren an der Füllstelle. */
  fuellzeit: 4,
  /** 2000 l über die eigene Pumpe plus Anfahren. */
  entleerzeit: 3,
};

export interface PendelParams {
  fahrzeuge: number;
  tankinhalt: number;
  geschwindigkeit: number;
  fuellzeit: number;
  entleerzeit: number;
}

export type PendelWarning =
  /** Die Fahrstrecke ist Luftlinie × Umwegfaktor, nicht geroutet. */
  | 'estimatedDistance'
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
  streckeSource: 'route' | 'detour';
  /** Die Fahrtroute für die Karte, sofern eine gespeichert ist. */
  routedPositions?: LatLngPosition[];
  result?: ShuttleResult;
  warnings: PendelWarning[];
}

/** Eine Zahl aus dem Feld, oder die Vorbelegung. Nur endliche Werte zählen. */
const numberOr = (value: number | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export function pendelParams(item: Connection): PendelParams {
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
    fuellzeit: numberOr(item.pendelFuellzeit, PENDEL_DEFAULTS.fuellzeit),
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
  sollMengeOverride?: number
): PendelView | undefined {
  if (!isPendelRelevant(item)) return undefined;

  const params = { ...pendelParams(item), ...overrides };
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
      streckeSource: 'detour',
      warnings: ['notComputable'],
    };
  }
  if (distance.source === 'detour') {
    warnings.push('estimatedDistance');
  }

  const result = computeShuttle({
    strecke: distance.strecke,
    geschwindigkeit: params.geschwindigkeit,
    tankinhalt: params.tankinhalt,
    fuellzeit: params.fuellzeit,
    entleerzeit: params.entleerzeit,
    fahrzeuge: params.fahrzeuge,
    sollMenge,
  });

  if (!result) {
    warnings.push('notComputable');
  } else {
    if (result.begrenztDurchFuellstelle) warnings.push('fillStationLimited');
    if (!result.traegtSollmenge) warnings.push('sollMengeNotReached');
  }

  return {
    params,
    sollMenge,
    strecke: distance.strecke,
    streckeSource: distance.source,
    routedPositions: pendelRoutedPositions(item),
    result,
    warnings,
  };
}

/**
 * Die Zeile für Kartenpopup und Elementliste, oder `undefined` ohne rechenbares
 * Ergebnis.
 */
export function pendelSummary(item: Connection): string | undefined {
  const view = pendelView(item);
  if (!view?.result) return undefined;
  return `Pendelverkehr ${view.params.fahrzeuge} Fz: ${Math.round(
    view.result.menge
  )} l/min`;
}
