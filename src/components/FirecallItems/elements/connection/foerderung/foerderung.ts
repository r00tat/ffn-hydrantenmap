'use client';

import type { LatLngPosition } from '../../../../../common/geo';
import { FOERDERUNG_DEFAULTS } from './defaults';
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
import {
  DEFAULT_HOSE_LENGTH_M,
  frictionBreakdownPer100m,
  type FrictionBreakdown,
  type FrictionModel,
} from './frictionLoss';

export { FOERDERUNG_DEFAULTS } from './defaults';
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
  /** Tabelle oder Rohrhydraulik — siehe docs/loeschwasserfoerderung.md. */
  frictionModel: FrictionModel;
  /** Absolute Rauheit in mm. Nur im Modell wirksam. */
  rauheit: number;
  /** bar je Kupplung bei 1000 l/min. Nur im Modell wirksam. */
  kupplungsverlust: number;
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
  /**
   * Das Rohrhydraulik-Modell liegt **unter** dem Wert der Ausbildungsunterlage.
   * Dann weist die Rechnung womöglich eine Pumpe zu wenig aus, und das muss
   * dastehen — die Tabelle ist die Grundlage, auf die sich hier jeder beruft.
   */
  | 'modelBelowTable'
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
  /**
   * Woher die Höhen des Profils stammen — eigenes Modell oder Rückfallebene.
   * `undefined`, solange gar kein Profil vorliegt.
   *
   * Getrennt von `elevationSource`: das sagt, **ob** gemessene Höhen vorliegen,
   * das hier sagt **woher**. Ohne die Angabe ist eine Abweichung gegenüber
   * einem früheren Ergebnis nicht zuordenbar.
   */
  elevationOrigin?: NonNullable<Connection['elevationSource']>;
  /** Welche Stufe des eigenen Höhenmodells geantwortet hat. */
  elevationLevel?: Connection['elevationLevel'];
  /** Abtastweite des Profils in m. */
  elevationSpacingM?: number;
  /** Reibungsverlust in bar je 100 m; `undefined` bei unbekannter Dimension. */
  frictionPer100m?: number;
  /** Schlauch und Kupplungen getrennt, samt Herkunft des Werts. */
  frictionBreakdown?: FrictionBreakdown;
  /**
   * Der Tabellenwert zum Vergleich — nur gesetzt, wenn das Modell rechnet.
   *
   * Er ist der Grund, dass überhaupt zweimal gerechnet wird: Ohne ihn wäre
   * nicht zu sehen, wie weit das Modell von der belegten Unterlage abweicht,
   * und `modelBelowTable` hätte keine Grundlage.
   */
  frictionTableValue?: number;
  dimension: string;
  /** Länge eines Schlauchs in m — bestimmt Schlauchzahl und Kupplungen. */
  hoseLengthM: number;
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
    frictionModel:
      item.frictionModel === 'colebrook'
        ? 'colebrook'
        : FOERDERUNG_DEFAULTS.frictionModel,
    rauheit: numberOr(item.rauheit, FOERDERUNG_DEFAULTS.rauheit),
    kupplungsverlust: numberOr(
      item.kupplungsverlust,
      FOERDERUNG_DEFAULTS.kupplungsverlust
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

  const length = calculateDistance(connectionDisplayPositions(item));
  const stored = storedElevations(item);
  // Ohne gültiges Profil wird die Abtastung hier gebildet: die Streckenmeter
  // braucht die Rechnung auch dann, um die Handeingabe linear zu verteilen.
  const drawnSamples = stored?.samples ?? foerderungSamples(item);
  const storedProfile = stored?.elevations;

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
      isElevationFallback(item) ? 'elevationFailed' : 'noElevationData'
    );
  }

  const dimension = item.dimension || 'B';
  const hoseLengthM = item.oneHozeLength || DEFAULT_HOSE_LENGTH_M;
  // Der Reibungswert hängt an der Menge **je Leitung**, nicht an der Sollmenge:
  // Parallele Leitungen tragen je Q/n.
  const flowPerLine = params.foerderMenge / params.paralleleLeitungen;
  const frictionBreakdown = frictionBreakdownPer100m(flowPerLine, dimension, {
    model: params.frictionModel,
    roughnessMm: params.rauheit,
    couplingBarAtNominal: params.kupplungsverlust,
    hoseLengthM,
  });
  const frictionPer100m = frictionBreakdown?.total;
  // Zum Vergleich immer auch der Tabellenwert, sobald das Modell rechnet.
  const frictionTableValue =
    frictionBreakdown?.source === 'model'
      ? frictionBreakdownPer100m(flowPerLine, dimension)?.total
      : undefined;
  if (frictionPer100m === undefined) {
    warnings.push('unknownDimension');
  }
  if (
    frictionPer100m !== undefined &&
    frictionTableValue !== undefined &&
    frictionPer100m < frictionTableValue
  ) {
    warnings.push('modelBelowTable');
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
    elevationOrigin: stored?.source,
    elevationLevel: stored?.level,
    elevationSpacingM: stored?.spacingM,
    frictionPer100m,
    frictionBreakdown,
    frictionTableValue,
    dimension,
    hoseLengthM,
    profile,
    // Parallele Leitungen wirken hier als Faktor und bei der Fördermenge als
    // Teiler: Zwei B-Leitungen brauchen die doppelte Zahl an B-Längen, tragen
    // aber je die halbe Menge.
    hoseCount: Math.ceil(length / hoseLengthM) * params.paralleleLeitungen,
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
  isElevationFallback(item);

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
