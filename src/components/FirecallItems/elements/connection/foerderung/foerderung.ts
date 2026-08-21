'use client';

import type { LatLngPosition } from '../../../../../common/geo';
import type { Connection } from '../../../../firebase/firestore';
import { calculateDistance, getConnectionPositions } from '../distance';
import { connectionDisplayPositions } from '../streetRouting';
import {
  foerderungSamples,
  isElevationFallback,
  isFoerderungEnabled,
  isFoerderungReversed,
  storedElevations,
} from './elevationProfile';
import { frictionLossPer100m, isTabulatedDimension } from './frictionLoss';
import {
  computeFoerderung,
  type FoerderungProfilePoint,
  type FoerderungResult,
} from './hydraulics';

/**
 * Die Fassade: liest die Felder einer Leitung und liefert das fertige Ergebnis
 * für Karte und Dialog.
 *
 * Hier wird nichts gecacht. Nur das Höhenprofil ist ein Netzaufruf und liegt am
 * Element; die Pumpenrechnung selbst ist reine Mathematik und läuft bei jedem
 * Render neu. Damit gibt es nichts zu invalidieren: Ein Punkt wird verschoben,
 * das Profil wird nachgezogen, die Pumpen wandern mit.
 */

/**
 * Vorbelegungen, alle belegt — Herkunft je Wert in
 * docs/loeschwasserfoerderung.md.
 */
export const FOERDERUNG_DEFAULTS = {
  /** Normale Fördermenge einer Zubringleitung. */
  foerderMenge: 1000,
  /** 5 bar Strahlrohr + 1 bar Verteiler und Löschleitung. */
  zielDruck: 6,
  /** PFPN 10-1000 im Dauerbetrieb; 10 bar wäre der Nennwert ohne Reserve. */
  pumpenAusgangsdruck: 8,
  /** Mindest-Eingangsdruck an der nächsten Pumpe. */
  pumpenEingangsdruck: 1.5,
  /** Nennförderstrom FPN 10-1000. */
  pumpenNennstrom: 1000,
  paralleleLeitungen: 1,
};

/** Länge eines Schlauches, wenn an der Leitung keine hinterlegt ist. */
const DEFAULT_HOSE_LENGTH = 20;

/**
 * Die aufgefüllten Parameter. Eigenes Interface statt `typeof
 * FOERDERUNG_DEFAULTS`, damit die Werte Zahlen sind und nicht die Literale der
 * Vorbelegung.
 */
export interface FoerderungParams {
  foerderMenge: number;
  zielDruck: number;
  pumpenAusgangsdruck: number;
  pumpenEingangsdruck: number;
  pumpenNennstrom: number;
  paralleleLeitungen: number;
}

export type FoerderungWarning =
  | 'unknownDimension'
  /** Kein Profil vorhanden — noch nicht abgefragt oder Rechner gerade an. */
  | 'noElevationData'
  /**
   * Die Abfrage ist für diese Lage **gescheitert**.
   *
   * Eigene Warnung und nicht dasselbe wie `noElevationData`: „liegt nicht vor"
   * und „ließ sich nicht holen" sind für den, der davorsitzt, zwei verschiedene
   * Lagen — die zweite ist ein Anlass, es noch einmal zu versuchen. Der
   * Unterschied war bisher im Code vorhanden (`foerderungElevationFailed`) und
   * wurde nirgends angezeigt.
   */
  | 'elevationFailed'
  | 'flowAbovePumpRating'
  | 'notFeasible';

export interface FoerderungPumpMarker {
  position: LatLngPosition;
  distance: number;
  eingangsdruck?: number;
  ausgangsdruck: number;
}

export interface FoerderungView {
  params: FoerderungParams;
  /** Länge der gezeichneten Linie in m. */
  length: number;
  /** Höhenunterschied Entnahme → Ziel in m, in Förderrichtung gezählt. */
  hoehenunterschied: number;
  /** Ob vom letzten zum ersten gezeichneten Punkt gefördert wird. */
  reversed: boolean;
  /** Anzahl der gezeichneten Punkte — benennt die Enden der Förderrichtung. */
  pointCount: number;
  elevationSource: 'profile' | 'manual';
  /** Reibungsverlust in bar je 100 m; `undefined` bei unbekannter Dimension. */
  frictionPer100m?: number;
  /** Ob der Reibungswert aus der Tabelle stammt oder abgeleitet ist. */
  frictionTabulated: boolean;
  dimension: string;
  profile: FoerderungProfilePoint[];
  pumps: FoerderungPumpMarker[];
  result?: FoerderungResult;
  /** Benötigte Schlauchlängen, parallele Leitungen eingerechnet. */
  hoseCount: number;
  warnings: FoerderungWarning[];
}

/**
 * Die Koordinate an einem Streckenmeter, linear zwischen den Abtastpunkten.
 *
 * Die Pumpenstandorte werden auf der Strecke gelöst und liegen deshalb meist
 * **zwischen** zwei Abtastpunkten — auf den nächsten zu runden verschöbe sie um
 * bis zu 25 m.
 */
function positionAtDistance(
  samples: { position: LatLngPosition; distance: number }[],
  distance: number
): LatLngPosition {
  if (samples.length === 0) return [0, 0];
  if (distance <= samples[0].distance) return samples[0].position;
  for (let i = 1; i < samples.length; i += 1) {
    if (samples[i].distance >= distance) {
      const span = samples[i].distance - samples[i - 1].distance;
      const ratio = span > 0 ? (distance - samples[i - 1].distance) / span : 0;
      return [
        samples[i - 1].position[0] +
          (samples[i].position[0] - samples[i - 1].position[0]) * ratio,
        samples[i - 1].position[1] +
          (samples[i].position[1] - samples[i - 1].position[1]) * ratio,
      ];
    }
  }
  return samples[samples.length - 1].position;
}

/** Eine Zahl aus dem Feld, oder die Vorbelegung. Nur endliche Werte zählen. */
const numberOr = (value: number | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export function foerderungParams(item: Connection): FoerderungParams {
  return {
    foerderMenge: numberOr(
      item.foerderMenge,
      FOERDERUNG_DEFAULTS.foerderMenge
    ),
    zielDruck: numberOr(item.zielDruck, FOERDERUNG_DEFAULTS.zielDruck),
    pumpenAusgangsdruck: numberOr(
      item.pumpenAusgangsdruck,
      FOERDERUNG_DEFAULTS.pumpenAusgangsdruck
    ),
    pumpenEingangsdruck: numberOr(
      item.pumpenEingangsdruck,
      FOERDERUNG_DEFAULTS.pumpenEingangsdruck
    ),
    pumpenNennstrom: numberOr(
      item.pumpenNennstrom,
      FOERDERUNG_DEFAULTS.pumpenNennstrom
    ),
    paralleleLeitungen: Math.max(
      1,
      Math.round(
        numberOr(
          item.paralleleLeitungen,
          FOERDERUNG_DEFAULTS.paralleleLeitungen
        )
      )
    ),
  };
}

/**
 * Das Ergebnis für eine Leitung, oder `undefined`, wenn der Rechner nicht
 * aktiv ist.
 *
 * `overrides` erlaubt dem Dialog, mit geänderten Parametern zu rechnen, ohne sie
 * vorher zu speichern — das ist der Zweck des Reglers: sehen, wie die
 * Pumpenzahl auf die Literleistung reagiert.
 */
export function foerderungView(
  item: Connection,
  overrides: Partial<FoerderungParams> = {}
): FoerderungView | undefined {
  if (!isFoerderungEnabled(item)) return undefined;

  const params = { ...foerderungParams(item), ...overrides };
  const warnings: FoerderungWarning[] = [];

  const drawnSamples = foerderungSamples(item);
  const length = calculateDistance(connectionDisplayPositions(item));
  const storedProfile = storedElevations(item, drawnSamples);

  // Ab hier wird in Förderrichtung gerechnet: Bei umgekehrter Richtung zählen
  // die Streckenmeter vom letzten Punkt aus, Koordinaten und Höhen wandern mit.
  // Gedreht wird nur diese Sicht, nicht die Abtastung — die Signatur des
  // gespeicherten Profils bleibt damit gültig.
  const reversed = isFoerderungReversed(item);
  const lastDistance = drawnSamples[drawnSamples.length - 1]?.distance ?? 0;
  const samples = reversed
    ? drawnSamples
        .map(({ position, distance }) => ({
          position,
          distance: lastDistance - distance,
        }))
        .reverse()
    : drawnSamples;
  const elevations =
    storedProfile && reversed ? [...storedProfile].reverse() : storedProfile;

  // Ohne Profil gilt die Handeingabe als Gesamtdifferenz, linear verteilt.
  // Zwischenkuppen sind dann unbekannt — der Dialog sagt das.
  const manualClimb = numberOr(item.hoehenunterschied, 0);
  const profile: FoerderungProfilePoint[] = samples.map((sample, index) => ({
    distance: sample.distance,
    elevation: elevations
      ? elevations[index]
      : lastDistance > 0
        ? (manualClimb * sample.distance) / lastDistance
        : 0,
  }));

  if (!elevations) {
    warnings.push(
      isElevationFallback(item, drawnSamples)
        ? 'elevationFailed'
        : 'noElevationData'
    );
  }

  const dimension = item.dimension || 'B';
  const frictionPer100m = frictionLossPer100m(
    params.foerderMenge / params.paralleleLeitungen,
    dimension
  );
  if (frictionPer100m === undefined) {
    warnings.push('unknownDimension');
  }
  if (params.foerderMenge > params.pumpenNennstrom) {
    warnings.push('flowAbovePumpRating');
  }

  const result =
    frictionPer100m !== undefined && profile.length >= 2
      ? computeFoerderung({
          profile,
          frictionBarPerMeter: frictionPer100m / 100,
          ausgangsdruck: params.pumpenAusgangsdruck,
          eingangsdruck: params.pumpenEingangsdruck,
          zieldruck: params.zielDruck,
        })
      : undefined;

  if (result && !result.darstellbar) {
    warnings.push('notFeasible');
  }

  return {
    params,
    length,
    hoehenunterschied: elevations
      ? elevations[elevations.length - 1] - elevations[0]
      : manualClimb,
    reversed,
    pointCount: getConnectionPositions(item).length,
    elevationSource: elevations ? 'profile' : 'manual',
    frictionPer100m,
    frictionTabulated: isTabulatedDimension(dimension),
    dimension,
    profile,
    // Parallele Leitungen wirken hier als Faktor und bei der Fördermenge als
    // Teiler: Zwei B-Leitungen brauchen die doppelte Zahl an B-Längen, tragen
    // aber je die halbe Menge.
    hoseCount:
      Math.ceil(length / (item.oneHozeLength || DEFAULT_HOSE_LENGTH)) *
      params.paralleleLeitungen,
    pumps: (result?.pumps ?? []).map((pump) => ({
      position: positionAtDistance(samples, pump.distance),
      distance: pump.distance,
      eingangsdruck: pump.eingangsdruck,
      ausgangsdruck: pump.ausgangsdruck,
    })),
    result,
    warnings,
  };
}

/** Ob die Höhenabfrage für die aktuelle Lage gescheitert ist. */
export const foerderungElevationFailed = (item: Connection): boolean =>
  isElevationFallback(item, foerderungSamples(item));

/**
 * Die Zeile für Kartenpopup und Elementliste, oder `undefined` ohne aktiven
 * Rechner bzw. ohne rechenbares Ergebnis.
 */
export function foerderungSummary(item: Connection): string | undefined {
  const view = foerderungView(item);
  if (!view?.result) return undefined;
  return `Förderung ${view.params.foerderMenge} l/min: ${
    view.result.verstaerkerpumpen
  } Verstärkerpumpe${view.result.verstaerkerpumpen === 1 ? '' : 'n'}`;
}
