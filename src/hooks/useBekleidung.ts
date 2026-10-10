'use client';

import {
  BEKLEIDUNG_ARTIKEL_COLLECTION,
  BEKLEIDUNG_AUSGABE_COLLECTION,
  BEKLEIDUNG_BESTAND_COLLECTION,
  BEKLEIDUNG_STUECK_COLLECTION,
  BEKLEIDUNG_WAESCHE_COLLECTION,
  type BekleidungArtikel,
  type BekleidungAusgabe,
  type BekleidungBestand,
  type BekleidungStueck,
  type BekleidungWaesche,
} from '../common/bekleidung';
import { GROUP_COLLECTION_ID } from '../components/firebase/firestore';
import {
  useFirebaseCollectionState,
  type FirebaseCollectionState,
} from './useFirebaseCollection';

/*
 * Bekleidungsdaten einer Gruppe, live über `onSnapshot`.
 *
 * Lesen dürfen nur Bekleidungswart, Gruppen-Admin und Admin (Firestore-Regel
 * mit `get()` auf das Benutzerdokument). Der Aufrufer übergibt deshalb
 * `undefined`, solange keine Gruppe gewählt ist **oder** die Rolle fehlt —
 * ein leerer Sammlungsname heißt: keine Subscription, also auch kein
 * `permission-denied`. Ein leeres `pathSegments` allein abonnierte die Wurzel
 * `groups`, die kein Client lesen darf (dieselbe Vorsicht wie in `useGeraete`).
 */

function useGroupCollection<T>(
  groupId: string | undefined,
  collection: string,
): FirebaseCollectionState<T> {
  return useFirebaseCollectionState<T>({
    collectionName: groupId ? GROUP_COLLECTION_ID : '',
    pathSegments: groupId ? [groupId, collection] : [],
    includeMetadataChanges: true,
  });
}

export function useBekleidungArtikel(
  groupId?: string,
): FirebaseCollectionState<BekleidungArtikel> {
  return useGroupCollection<BekleidungArtikel>(groupId, BEKLEIDUNG_ARTIKEL_COLLECTION);
}

export function useBekleidungStuecke(
  groupId?: string,
): FirebaseCollectionState<BekleidungStueck> {
  return useGroupCollection<BekleidungStueck>(groupId, BEKLEIDUNG_STUECK_COLLECTION);
}

export function useBekleidungBestand(
  groupId?: string,
): FirebaseCollectionState<BekleidungBestand> {
  return useGroupCollection<BekleidungBestand>(groupId, BEKLEIDUNG_BESTAND_COLLECTION);
}

export function useBekleidungAusgaben(
  groupId?: string,
): FirebaseCollectionState<BekleidungAusgabe> {
  return useGroupCollection<BekleidungAusgabe>(groupId, BEKLEIDUNG_AUSGABE_COLLECTION);
}

export function useBekleidungWaeschen(
  groupId?: string,
): FirebaseCollectionState<BekleidungWaesche> {
  return useGroupCollection<BekleidungWaesche>(groupId, BEKLEIDUNG_WAESCHE_COLLECTION);
}
