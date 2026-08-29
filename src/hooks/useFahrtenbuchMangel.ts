'use client';

import { useMemo } from 'react';
import { orderBy, where, type QueryConstraint } from 'firebase/firestore';
import {
  FAHRTENBUCH_MANGEL_COLLECTION_ID,
  isOpenMangel,
  mangelItemId,
  mangelItemType,
  type Mangel,
  type MangelItemType,
} from '../common/mangel';
import { GROUP_COLLECTION_ID } from '../components/firebase/firestore';
import useFirebaseCollection from './useFirebaseCollection';

export interface UseFahrtenbuchMangelOptions {
  /**
   * Nur die Mängel eines Fahrzeugs. Ohne Angabe die der ganzen Gruppe — der
   * Regelfall: Die Mängelseite ist die Arbeitsliste über alle Fahrzeuge.
   */
  vehicleId?: string;
  /**
   * Nur Mängel eines Typs. Wird **im Speicher** gefiltert und nicht als
   * `where`-Bedingung: Dokumente aus der Zeit vor dem Feld tragen kein
   * `itemType`, und eine Firestore-Abfrage auf ein fehlendes Feld findet sie
   * nicht — `mangelItemType()` kennt dagegen die Vorgabe.
   */
  itemType?: MangelItemType;
}

export interface UseFahrtenbuchMangelResult {
  mangel: Mangel[];
  openMangel: Mangel[];
  /** Anzahl offener Mängel je Fahrzeug-ID. */
  openCountByVehicle: Map<string, number>;
  /** Anzahl offener Mängel je Ausrüstungs-ID. */
  openCountByGeraet: Map<string, number>;
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
  const { vehicleId, itemType } = options;

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
    const alle = groupId ? (mangel ?? []) : [];
    const list = itemType
      ? alle.filter((m) => mangelItemType(m) === itemType)
      : alle;
    const openMangel = list.filter(isOpenMangel);

    const openCountByVehicle = new Map<string, number>();
    const openCountByGeraet = new Map<string, number>();
    for (const item of openMangel) {
      const ziel =
        mangelItemType(item) === 'vehicle'
          ? openCountByVehicle
          : openCountByGeraet;
      const key = mangelItemId(item);
      if (!key) continue;
      ziel.set(key, (ziel.get(key) ?? 0) + 1);
    }
    return { mangel: list, openMangel, openCountByVehicle, openCountByGeraet };
  }, [groupId, mangel, itemType]);
}
