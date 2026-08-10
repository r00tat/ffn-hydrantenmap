'use client';

import { useMemo } from 'react';
import { orderBy, where, type QueryConstraint } from 'firebase/firestore';
import {
  FAHRTENBUCH_MANGEL_COLLECTION_ID,
  isOpenMangel,
  type Mangel,
} from '../common/mangel';
import { GROUP_COLLECTION_ID } from '../components/firebase/firestore';
import useFirebaseCollection from './useFirebaseCollection';

export interface UseFahrtenbuchMangelOptions {
  /**
   * Nur die Mängel eines Fahrzeugs. Ohne Angabe die der ganzen Gruppe — der
   * Regelfall: Die Mängelseite ist die Arbeitsliste über alle Fahrzeuge.
   */
  vehicleId?: string;
}

export interface UseFahrtenbuchMangelResult {
  mangel: Mangel[];
  openMangel: Mangel[];
  /** Anzahl offener Mängel je Fahrzeug-ID. */
  openCountByVehicle: Map<string, number>;
}

/**
 * Die Mängel einer Gruppe, absteigend nach Meldezeitpunkt.
 *
 * Bewusst ohne Seitengröße: Anders als die Fahrten wächst die Mängelliste
 * nicht mit jeder Fahrt, sondern nur mit jedem tatsächlichen Mangel — und eine
 * Arbeitsliste, die einen alten offenen Mangel abschneidet, wäre genau das
 * Problem, das dieses Feature lösen soll.
 */
export default function useFahrtenbuchMangel(
  groupId?: string,
  options: UseFahrtenbuchMangelOptions = {},
): UseFahrtenbuchMangelResult {
  const { vehicleId } = options;

  const queryConstraints = useMemo<QueryConstraint[]>(() => {
    const constraints: QueryConstraint[] = [];
    if (vehicleId) constraints.push(where('vehicleId', '==', vehicleId));
    constraints.push(orderBy('reportedAt', 'desc'));
    return constraints;
  }, [vehicleId]);

  const mangel = useFirebaseCollection<Mangel>({
    // Leerer String heißt: keine Subscription. Ein leeres `pathSegments`
    // allein abonnierte die Wurzel-Collection `groups`, die kein Client lesen
    // darf — dieselbe Vorsichtsmaßnahme wie in `useFahrtenbuchEntries`.
    collectionName: groupId ? GROUP_COLLECTION_ID : '',
    pathSegments: groupId ? [groupId, FAHRTENBUCH_MANGEL_COLLECTION_ID] : [],
    queryConstraints,
  });

  return useMemo(() => {
    const list = groupId ? (mangel ?? []) : [];
    const openMangel = list.filter(isOpenMangel);
    const openCountByVehicle = new Map<string, number>();
    for (const item of openMangel) {
      openCountByVehicle.set(
        item.vehicleId,
        (openCountByVehicle.get(item.vehicleId) ?? 0) + 1,
      );
    }
    return { mangel: list, openMangel, openCountByVehicle };
  }, [groupId, mangel]);
}
