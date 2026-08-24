'use client';

import type { Connection, MultiPointItem } from '../../../../firebase/firestore';
import { connectionDisplayPositions } from '../streetRouting';
import {
  FALLBACK_SAMPLING,
  FINE_SAMPLING,
  sampleAlongPath,
  TARGET_SAMPLE_SPACING_M,
  type ElevationSample,
  type SamplingOptions,
} from './elevationSampling';

/**
 * Das gespeicherte Höhenprofil einer Leitung: Gültigkeit und Nachziehbedarf.
 *
 * Aufbau wie `streetRouting.ts`, aus demselben Grund: Das Profil steht am
 * Element, damit Karte und Dialog rechnen können, ohne abzufragen — eine
 * Anfrage je Änderung, keine je Render.
 */

/** `'true'`/`'false'` wie bei allen booleschen Feldern der Elemente. */
export const isFoerderungEnabled = (item: MultiPointItem): boolean =>
  (item as Connection).foerderung === 'true';

/**
 * Ob vom letzten zum ersten Punkt gefördert wird.
 *
 * Steht hier neben `isFoerderungEnabled`, betrifft aber **nur** die Rechnung:
 * Die Abtastung und damit die Signatur des Höhenprofils bleiben in
 * Zeichenrichtung, sonst würde jedes Umkehren eine neue Höhenabfrage auslösen.
 */
export const isFoerderungReversed = (item: MultiPointItem): boolean =>
  (item as Connection).foerderungUmgekehrt === 'true';

/**
 * Die Abtastpunkte, zu denen ein Profil gehört: entlang des gezeichneten
 * Verlaufs, also mit aktivem Straßen-Routing entlang der Straße.
 *
 * Die Vorgabe ist die **feine** Abtastung: das ist ab jetzt die gewünschte.
 * Die grobe kommt nur noch über einen ausdrücklichen Aufruf — aus der
 * Rückfallebene und beim Prüfen eines gespeicherten Profils.
 */
export const foerderungSamples = (
  item: MultiPointItem,
  options: SamplingOptions = FINE_SAMPLING
): ElevationSample[] =>
  sampleAlongPath(connectionDisplayPositions(item), options);

/**
 * Abtastweite der Rückfallebene, und die Vorgabe für Profile ohne
 * `elevationSpacing` — die Profile, die vor der Einführung des Feldes
 * entstanden sind. Sie müssen gültig bleiben, sonst fragt die Karte für jede
 * bestehende Leitung von neuem ab.
 */
export const FALLBACK_SAMPLE_SPACING_M = TARGET_SAMPLE_SPACING_M;

/**
 * Erkennungszeichen dessen, wofür ein gespeichertes Profil gilt.
 *
 * Die Streckenmeter gehören mit hinein, nicht nur die Koordinaten: Ändert sich
 * die Länge, ändert sich die Abtastung, auch wenn Anfang und Ende gleich
 * bleiben. Ohne Toleranz verglichen — die Punkte entstehen deterministisch aus
 * derselben Geometrie wie die Signatur, und eine Abweichung kostet nur eine
 * Abfrage. Dieselbe Überlegung wie bei `routingSignature`.
 *
 * Die Abtastweite steht mit in der Signatur: dieselben Koordinaten bei anderer
 * Abtastweite sind ein anderes Profil.
 */
export const elevationSignature = (
  samples: ElevationSample[],
  spacingM: number
): string =>
  JSON.stringify([
    spacingM,
    samples.map(({ position, distance }) => [
      position[0],
      position[1],
      Math.round(distance),
    ]),
  ]);

/** Die Abtastweite, zu der ein gespeichertes Profil gehört. */
const storedSpacing = (connection: Connection): number => {
  const value = Number(connection.elevationSpacing);
  return Number.isFinite(value) && value > 0
    ? value
    : FALLBACK_SAMPLE_SPACING_M;
};

/**
 * Die Abtastung, mit der ein gespeichertes Profil entstanden ist.
 *
 * Rekonstruiert wird über die Abtastweite, weil nur sie am Element steht. Eine
 * unbekannte Weite — handgesetzt oder aus einer späteren Version — bekommt den
 * vorsichtigen Deckel: zu wenige Punkte machen die Signatur ungültig und
 * kosten eine Abfrage, zu viele wären ein Dokument, das nicht mehr passt.
 */
const samplingFor = (spacingM: number): SamplingOptions =>
  [FINE_SAMPLING, FALLBACK_SAMPLING].find(
    (sampling) => sampling.spacingM === spacingM
  ) ?? { spacingM, maxSamples: FALLBACK_SAMPLING.maxSamples };

export interface StoredElevationProfile {
  /** Höhen in m an den Abtastpunkten, in Zeichenrichtung. */
  elevations: number[];
  /** Die Abtastpunkte, zu denen die Höhen gehören. */
  samples: ElevationSample[];
  spacingM: number;
  source: NonNullable<Connection['elevationSource']>;
  level?: Connection['elevationLevel'];
}

/**
 * Das gespeicherte Profil samt der Abtastung, zu der es gehört, sofern es zur
 * aktuellen Lage passt und vollständig ist. Sonst `undefined` — dann gilt die
 * Handeingabe, bis das Profil nachgezogen ist.
 *
 * Die Abtastweite steht am Element und wird nicht erraten: ein Profil aus der
 * Rückfallebene mit 50 m muss als gültig erkannt werden, auch wenn die
 * gewünschte Abtastung feiner ist — sonst fragt jeder Render erneut ab.
 *
 * Fehlt `elevationSource`, gilt `'opentopodata'`: das ist die Quelle jedes
 * Profils, das vor dem eigenen Höhenmodell entstanden ist.
 */
export function storedElevations(
  item: MultiPointItem
): StoredElevationProfile | undefined {
  const connection = item as Connection;
  if (!isFoerderungEnabled(item)) return undefined;
  if (!connection.elevationProfile) return undefined;

  const spacingM = storedSpacing(connection);
  // Mit der **gespeicherten** Abtastung nachgebildet, nicht mit der
  // gewünschten: ein Profil aus der Rückfallebene mit 50 m bleibt damit
  // gültig, auch wenn ab jetzt feiner abgetastet wird. Sonst liefe die
  // Abfrage bei jedem Render erneut.
  const samples = foerderungSamples(item, samplingFor(spacingM));
  if (connection.elevationFor !== elevationSignature(samples, spacingM)) {
    return undefined;
  }

  try {
    const elevations = JSON.parse(connection.elevationProfile);
    if (
      !Array.isArray(elevations) ||
      elevations.length !== samples.length ||
      !elevations.every((value) => typeof value === 'number')
    ) {
      return undefined;
    }
    return {
      elevations: elevations as number[],
      samples,
      spacingM,
      source: connection.elevationSource || 'opentopodata',
      // `|| undefined`: geleert wird mit dem Leerstring, nicht durch Löschen
      // des Feldes.
      level: connection.elevationLevel || undefined,
    };
  } catch (err) {
    console.warn(
      `unable to parse elevation profile ${err} ${connection.elevationProfile}`
    );
    return undefined;
  }
}

/**
 * Ob die Höhenabfrage für die aktuelle Lage gescheitert ist. Wird im Dialog
 * ausgewiesen, damit ein Ergebnis aus der Handeingabe nicht für eines aus
 * Höhendaten genommen wird.
 */
export function isElevationFallback(item: MultiPointItem): boolean {
  const connection = item as Connection;
  if (!isFoerderungEnabled(item)) return false;
  if (connection.elevationFailed !== 'true') return false;
  const spacingM = storedSpacing(connection);
  return (
    connection.elevationFor ===
    elevationSignature(foerderungSamples(item, samplingFor(spacingM)), spacingM)
  );
}

export type ElevationTodo = 'none' | 'clear' | 'fetch';

const hasStoredElevation = (item: MultiPointItem): boolean => {
  const connection = item as Connection;
  return !!(
    connection.elevationProfile ||
    connection.elevationFor ||
    connection.elevationFailed
  );
};

/**
 * Was am Höhenprofil einer Leitung zu tun ist, nachdem sie sich geändert hat.
 *
 * `'fetch'` nur bei tatsächlichem Bedarf: Ein Profil, das zur Abtastung passt,
 * bleibt stehen — und eine Abfrage, die für genau diese Punkte schon gescheitert
 * ist, wird nicht bei jeder weiteren Änderung erneut versucht.
 *
 * Ohne aktiven Rechner wird gar nicht abgefragt. Eine gewöhnliche Leitung
 * kostet damit keine Anfrage.
 */
export function elevationTodo(item: MultiPointItem): ElevationTodo {
  if (item.type !== 'connection') return 'none';

  if (!isFoerderungEnabled(item)) {
    return hasStoredElevation(item) ? 'clear' : 'none';
  }

  const samples = foerderungSamples(item);
  if (samples.length < 2) return hasStoredElevation(item) ? 'clear' : 'none';
  if (storedElevations(item) || isElevationFallback(item)) return 'none';
  return 'fetch';
}
