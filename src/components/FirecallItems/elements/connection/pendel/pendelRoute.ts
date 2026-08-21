'use client';

import type { LatLngPosition } from '../../../../../common/geo';
import type { Connection, MultiPointItem } from '../../../../firebase/firestore';
import { calculateDistance, getConnectionPositions } from '../distance';
import { routingSignature } from '../routedPath';

/**
 * Die Fahrstrecke des Pendelverkehrs: gespeicherte Geometrie, ihre Gültigkeit
 * und der Ersatz, wenn keine zu bekommen ist.
 *
 * Sie ist **nicht** die Schlauchlänge. Der Schlauch zickzackt über die
 * gesetzten Punkte und folgt der Straße, ohne sich an Einbahnen zu halten; das
 * Fahrzeug fährt die Straße, und zwar nur von einem Ende zum anderen. Deshalb
 * ein eigener Satz Felder und ein eigenes Routing mit dem Profil `drive` —
 * siehe docs/pendelverkehr.md.
 */

/**
 * Umwegfaktor Straße gegen Luftlinie, wenn kein Routing zu bekommen ist.
 *
 * #693 nennt ihn als Ersatzweg. 1,3 ist der geläufige Planungswert im verbauten
 * Gebiet. Die damit gerechnete Strecke weist sich als Schätzung aus — eine
 * geschätzte Meterzahl, die wie eine gemessene aussieht, wäre schlimmer als
 * keine.
 */
export const DETOUR_FACTOR = 1.3;

/** Die Versorgungsart, die am Element steht. */
export type Versorgungsart = 'foerderung' | 'pendel' | 'vergleich';

/** Alles Unbekannte gilt als Förderung — das war der Stand vor #693. */
export const versorgungsart = (item: MultiPointItem): Versorgungsart => {
  const value = (item as Connection).versorgungsart;
  return value === 'pendel' || value === 'vergleich' ? value : 'foerderung';
};

/** Ob der Pendelverkehr für diese Leitung überhaupt gerechnet wird. */
export const isPendelRelevant = (item: MultiPointItem): boolean =>
  item.type === 'connection' &&
  (item as Connection).foerderung === 'true' &&
  versorgungsart(item) !== 'foerderung';

/**
 * Die beiden Enden der Leitung, in Förderrichtung: Entnahmestelle zuerst.
 *
 * Nur die Enden, nicht alle Punkte — ein Zwischenpunkt der Schlauchleitung ist
 * kein Wegpunkt der Fahrt. Damit ändert sich die Signatur auch nicht, wenn ein
 * Punkt in der Mitte wandert, und ein Routing-Aufruf bleibt aus.
 */
export function pendelEndpoints(
  item: MultiPointItem
): [LatLngPosition, LatLngPosition] | undefined {
  const positions = getConnectionPositions(item).filter(
    ([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng)
  );
  if (positions.length < 2) return undefined;

  const first = positions[0];
  const last = positions[positions.length - 1];
  return (item as Connection).foerderungUmgekehrt === 'true'
    ? [last, first]
    : [first, last];
}

/** Die Signatur, für die eine gespeicherte Fahrgeometrie gelten muss. */
export function pendelRoutingSignature(item: MultiPointItem): string {
  const endpoints = pendelEndpoints(item);
  return endpoints ? routingSignature(endpoints, 'drive') : '';
}

const parsePositions = (value?: string): LatLngPosition[] | undefined => {
  if (!value) return undefined;
  try {
    const positions = JSON.parse(value);
    return Array.isArray(positions) && positions.length > 1
      ? (positions as LatLngPosition[])
      : undefined;
  } catch (err) {
    console.warn(`unable to parse pendel route ${err} ${value}`);
    return undefined;
  }
};

/**
 * Die gespeicherte Fahrtroute, sofern sie zu den aktuellen Enden gehört. Sonst
 * `undefined` — dann gilt die Luftlinie mit Umwegfaktor, bis sie nachgezogen
 * ist.
 */
export function pendelRoutedPositions(
  item: MultiPointItem
): LatLngPosition[] | undefined {
  const connection = item as Connection;
  if (!isPendelRelevant(item)) return undefined;
  if (connection.pendelRoutedFor !== pendelRoutingSignature(item)) {
    return undefined;
  }
  return parsePositions(connection.pendelRoutedPositions);
}

/** Ob das Routing für die aktuelle Lage gescheitert ist. */
export function isPendelRoutingFallback(item: MultiPointItem): boolean {
  const connection = item as Connection;
  return (
    isPendelRelevant(item) &&
    connection.pendelRoutingFailed === 'true' &&
    connection.pendelRoutedFor === pendelRoutingSignature(item)
  );
}

export interface PendelDistance {
  /** Einfache Fahrstrecke in m. */
  strecke: number;
  /** Woher sie kommt. */
  source: 'route' | 'detour';
}

/**
 * Die einfache Fahrstrecke und ihre Herkunft.
 *
 * Gemessen wird die Geometrie mit derselben Funktion, die auch die Luftlinie
 * misst — damit ist die angezeigte Zahl immer die der gezeichneten Linie, und
 * es braucht kein eigenes Meter-Feld am Element. Gleiches Muster wie beim
 * Schlauch-Routing.
 */
export function pendelDistance(item: MultiPointItem): PendelDistance | undefined {
  const endpoints = pendelEndpoints(item);
  if (!endpoints) return undefined;

  const routed = pendelRoutedPositions(item);
  if (routed) {
    return { strecke: calculateDistance(routed), source: 'route' };
  }

  return {
    strecke: calculateDistance(endpoints) * DETOUR_FACTOR,
    source: 'detour',
  };
}

export type PendelRoutingTodo = 'none' | 'clear' | 'route';

const hasStoredRoute = (item: MultiPointItem): boolean => {
  const connection = item as Connection;
  return !!(
    connection.pendelRoutedPositions ||
    connection.pendelRoutedFor ||
    connection.pendelRoutingFailed
  );
};

/**
 * Was an der Fahrtroute zu tun ist, nachdem sich die Leitung geändert hat.
 *
 * `'route'` nur bei tatsächlichem Bedarf: Eine Geometrie, die zu den Enden
 * passt, bleibt stehen — und ein Routing, das für genau diese Enden schon
 * gescheitert ist, wird nicht bei jeder weiteren Änderung erneut versucht.
 *
 * Solange die Versorgungsart `foerderung` ist, wird nicht geroutet: Eine
 * gewöhnliche Förderungsrechnung soll keinen zusätzlichen Aufruf kosten.
 */
export function pendelRoutingTodo(item: MultiPointItem): PendelRoutingTodo {
  if (!isPendelRelevant(item)) {
    return hasStoredRoute(item) ? 'clear' : 'none';
  }
  if (!pendelEndpoints(item)) return hasStoredRoute(item) ? 'clear' : 'none';
  if (pendelRoutedPositions(item) || isPendelRoutingFallback(item)) {
    return 'none';
  }
  return 'route';
}
