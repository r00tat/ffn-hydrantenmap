'use client';

import { useMemo } from 'react';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  FirecallItem,
  Wasserstand,
  filterActiveItems,
} from '../components/firebase/firestore';
import useFirebaseCollection from './useFirebaseCollection';
import { useFirecallId } from './useFirecall';
import { useHistoryPathSegments } from './useMapEditor';

/**
 * Die Wasserstands-Szenarien des Einsatzes.
 *
 * Vorbild `useDammLinien`: gefiltert wird auf den Typ, alles weitere
 * entscheiden die Rechenfunktionen — damit die Regel einmal im Haus steht.
 */
export default function useWasserstandSzenarien(): Wasserstand[] {
  const firecallId = useFirecallId();
  const historyPathSegments = useHistoryPathSegments();

  const firecallItems = useFirebaseCollection<FirecallItem>({
    collectionName: FIRECALL_COLLECTION_ID,
    pathSegments: [
      firecallId,
      ...historyPathSegments,
      FIRECALL_ITEMS_COLLECTION_ID,
    ],
    filterFn: filterActiveItems,
  });

  return useMemo(
    () =>
      (firecallItems?.filter((item) => item?.type === 'wasserstand') ??
        []) as Wasserstand[],
    [firecallItems]
  );
}
