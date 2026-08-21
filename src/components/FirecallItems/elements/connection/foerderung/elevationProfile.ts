'use client';

import type { Connection, MultiPointItem } from '../../../../firebase/firestore';
import { connectionDisplayPositions } from '../streetRouting';
import { sampleAlongPath, type ElevationSample } from './elevationSampling';

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
 * Die Abtastpunkte, zu denen ein Profil gehört: entlang des gezeichneten
 * Verlaufs, also mit aktivem Straßen-Routing entlang der Straße.
 */
export const foerderungSamples = (item: MultiPointItem): ElevationSample[] =>
  sampleAlongPath(connectionDisplayPositions(item));

/**
 * Erkennungszeichen dessen, wofür ein gespeichertes Profil gilt.
 *
 * Die Streckenmeter gehören mit hinein, nicht nur die Koordinaten: Ändert sich
 * die Länge, ändert sich die Abtastung, auch wenn Anfang und Ende gleich
 * bleiben. Ohne Toleranz verglichen — die Punkte entstehen deterministisch aus
 * derselben Geometrie wie die Signatur, und eine Abweichung kostet nur eine
 * Abfrage. Dieselbe Überlegung wie bei `routingSignature`.
 */
export const elevationSignature = (samples: ElevationSample[]): string =>
  JSON.stringify(
    samples.map(({ position, distance }) => [
      position[0],
      position[1],
      Math.round(distance),
    ])
  );

/**
 * Die gespeicherten Höhen, sofern sie zu den aktuellen Abtastpunkten gehören
 * und vollständig sind. Sonst `undefined` — dann gilt die Handeingabe, bis das
 * Profil nachgezogen ist.
 */
export function storedElevations(
  item: MultiPointItem,
  samples: ElevationSample[]
): number[] | undefined {
  const connection = item as Connection;
  if (!isFoerderungEnabled(item)) return undefined;
  if (connection.elevationFor !== elevationSignature(samples)) return undefined;
  if (!connection.elevationProfile) return undefined;

  try {
    const elevations = JSON.parse(connection.elevationProfile);
    return Array.isArray(elevations) &&
      elevations.length === samples.length &&
      elevations.every((value) => typeof value === 'number')
      ? (elevations as number[])
      : undefined;
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
export function isElevationFallback(
  item: MultiPointItem,
  samples: ElevationSample[]
): boolean {
  const connection = item as Connection;
  return (
    isFoerderungEnabled(item) &&
    connection.elevationFailed === 'true' &&
    connection.elevationFor === elevationSignature(samples)
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
  if (storedElevations(item, samples) || isElevationFallback(item, samples)) {
    return 'none';
  }
  return 'fetch';
}
