'use client';

import type { LatLngPosition } from '../../../../../common/geo';
import type { Connection, MultiPointItem } from '../../../../firebase/firestore';
import { calculateDistance, getConnectionPositions } from '../distance';
import { itemRoutingProfile } from '../streetRouting';
import {
  connectionDisplayPositions,
  isStreetRoutingEnabled,
  isStreetRoutingFallback,
} from '../streetRouting';

/**
 * Die Fahrstrecke des Pendelverkehrs — **die gezeichnete Leitung selbst**.
 *
 * Es gab hier einmal eine zweite Geometrie: ein eigenes Routing zwischen den
 * beiden Enden, gestrichelt neben der Leitung gezeichnet. Das war falsch
 * gedacht. Wer eine Pendelstrecke absteckt, setzt die Punkte dorthin, wo
 * gefahren wird — eine zweite Linie, die sich einen anderen Weg sucht, ignoriert
 * genau diese Arbeit und behauptet eine Strecke, die niemand bestellt hat.
 *
 * Gerechnet wird deshalb mit dem Verlauf über **alle** Punkte. Damit die Strecke
 * der Straße folgt, wird die Leitung auf Routing mit dem Profil `drive`
 * gestellt — dieselben Felder wie beim Schlauch, nur ein anderes Profil. Siehe
 * docs/pendelverkehr.md.
 */

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
 * Ob der Verlauf für ein **Fahrzeug** geroutet ist.
 *
 * Nur dann ist die Länge eine Fahrstrecke: Das Fußgänger-Profil ignoriert
 * Einbahnen und Abbiegeverbote und schneidet über Fußwege ab. Ein
 * fehlgeschlagenes Routing zählt nicht mit — dann steht die Luftlinie zwischen
 * den Punkten.
 */
export const isVehicleRouted = (item: MultiPointItem): boolean =>
  isStreetRoutingEnabled(item) &&
  itemRoutingProfile(item) === 'drive' &&
  !isStreetRoutingFallback(item);

/**
 * Die beiden Enden der Leitung, in Förderrichtung: Entnahmestelle zuerst.
 *
 * Gebraucht für die Suche nach der Entnahmestelle in der Nähe und für die
 * Beschriftung der Richtung — nicht mehr fürs Routing.
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

export interface PendelDistance {
  /** Einfache Fahrstrecke in m. */
  strecke: number;
  /**
   * Woher sie kommt: `'route'` aus dem Fahrzeug-Routing über alle Punkte,
   * `'drawn'` aus der gezeichneten Linie ohne Routing.
   */
  source: 'route' | 'drawn';
}

/**
 * Die einfache Fahrstrecke und ihre Herkunft.
 *
 * Gemessen wird der Verlauf, den die Karte zeichnet — mit Routing der
 * Straßenverlauf über alle Punkte, sonst die Luftlinien zwischen ihnen.
 * Dieselbe Funktion wie für die Schlauchlänge; die angezeigte Zahl ist damit
 * immer die der gezeichneten Linie.
 *
 * **Kein Umwegfaktor.** Er gehörte zu der zweiten, automatisch gerouteten
 * Linie. Auf eine Strecke, die von Hand entlang der Straße abgesteckt wurde,
 * einen Aufschlag zu rechnen, wäre doppelt gezählt.
 */
export function pendelDistance(
  item: MultiPointItem
): PendelDistance | undefined {
  const positions = connectionDisplayPositions(item).filter(
    ([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng)
  );
  if (positions.length < 2) return undefined;

  return {
    strecke: calculateDistance(positions),
    source: isVehicleRouted(item) ? 'route' : 'drawn',
  };
}
