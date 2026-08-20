'use client';

import { LatLngPosition } from '../../../../common/geo';
import { Connection, MultiPointItem } from '../../../firebase/firestore';
import { getConnectionPositions } from './distance';
import {
  RoutingProfile,
  routingProfile,
  routingSignature,
} from './routedPath';

/**
 * Straßen-Routing einer Leitung: gespeicherte Geometrie, ihre Gültigkeit und
 * das Nachziehen, wenn sich die Punkte geändert haben.
 *
 * Die Geometrie steht am Element, damit die Karte sie zeichnen kann, ohne zu
 * routen — ein Aufruf je Änderung, keiner je Render.
 */

/**
 * Elementtypen mit der Option. Die Leitung braucht sie für die Schlauchstrecke,
 * die Linie für eine Wegberechnung entlang der Straße. Eine Fläche hat keinen
 * Verlauf, den man routen könnte.
 */
const STREET_ROUTING_TYPES = ['connection', 'line'];

export const isStreetRoutingItem = (type?: string): boolean =>
  !!type && STREET_ROUTING_TYPES.includes(type);

/** `'true'`/`'false'` wie bei allen booleschen Feldern der Elemente. */
export const isStreetRoutingEnabled = (item: MultiPointItem): boolean =>
  (item as Connection).streetRouting === 'true';

/**
 * Das gewählte Profil. Die Leitung hat kein Feld dafür und bleibt damit beim
 * Fußgänger-Profil — ein Schlauch fährt nicht.
 */
export const itemRoutingProfile = (item: MultiPointItem): RoutingProfile =>
  routingProfile((item as Connection).routingProfile);

/** Die Signatur, für die eine gespeicherte Geometrie gelten muss. */
export const itemRoutingSignature = (item: MultiPointItem): string =>
  routingSignature(getConnectionPositions(item), itemRoutingProfile(item));

const parsePositions = (value?: string): LatLngPosition[] | undefined => {
  if (!value) return undefined;
  try {
    const positions = JSON.parse(value);
    return Array.isArray(positions) && positions.length > 1
      ? (positions as LatLngPosition[])
      : undefined;
  } catch (err) {
    console.warn(`unable to parse routed positions ${err} ${value}`);
    return undefined;
  }
};

/**
 * Der gespeicherte Straßenverlauf, sofern er zu den aktuellen Punkten gehört.
 * Sonst `undefined` — dann gilt die direkte Verbindung, bis das Routing
 * nachgezogen ist.
 */
export function routedPositions(
  item: MultiPointItem
): LatLngPosition[] | undefined {
  const connection = item as Connection;
  if (!isStreetRoutingEnabled(item)) return undefined;
  if (connection.routedFor !== itemRoutingSignature(item)) return undefined;
  return parsePositions(connection.routedPositions);
}

/** Der Verlauf, den die Karte zeichnet und dessen Länge angezeigt wird. */
export function connectionDisplayPositions(
  item: MultiPointItem
): LatLngPosition[] {
  return routedPositions(item) ?? getConnectionPositions(item);
}

/**
 * Ob das Routing fehlgeschlagen ist und deshalb die Luftlinie gilt. Wird an der
 * Leitung ausgewiesen, damit eine zu kurze Meterangabe nicht für die Wahrheit
 * genommen wird.
 */
export function isStreetRoutingFallback(item: MultiPointItem): boolean {
  const connection = item as Connection;
  return (
    isStreetRoutingEnabled(item) &&
    connection.routingFailed === 'true' &&
    connection.routedFor === itemRoutingSignature(item)
  );
}

export type RoutingTodo = 'none' | 'clear' | 'route';

const hasStoredRouting = (item: MultiPointItem): boolean => {
  const connection = item as Connection;
  return !!(
    connection.routedPositions ||
    connection.routedFor ||
    connection.routingFailed
  );
};

/**
 * Was an einer Leitung zu tun ist, nachdem sie sich geändert hat.
 *
 * `'route'` nur bei tatsächlichem Bedarf: Eine Geometrie, die zu den Punkten
 * passt, bleibt stehen — und ein Routing, das für genau diese Punkte schon
 * gescheitert ist, wird nicht bei jeder weiteren Änderung erneut versucht.
 */
export function routingTodo(item: MultiPointItem): RoutingTodo {
  if (!isStreetRoutingItem(item.type)) return 'none';

  if (!isStreetRoutingEnabled(item) || getConnectionPositions(item).length < 2) {
    return hasStoredRouting(item) ? 'clear' : 'none';
  }

  if (routedPositions(item) || isStreetRoutingFallback(item)) return 'none';
  return 'route';
}
