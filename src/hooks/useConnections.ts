'use client';

import { useMemo } from 'react';
import {
  Connection,
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  FirecallItem,
  filterActiveItems,
} from '../components/firebase/firestore';
import useFirebaseCollection from './useFirebaseCollection';
import { useFirecallId } from './useFirecall';
import { useHistoryPathSegments } from './useMapEditor';

/**
 * Die Leitungen des Einsatzes, neueste zuletzt.
 *
 * Eigener Hook und nicht `useVehicles().otherItems`: Die Seite
 * „Löschwasserversorgung" braucht genau diesen Typ, und über den Namen ist
 * ablesbar, was sie liest.
 */
export default function useConnections(): Connection[] {
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
      (firecallItems?.filter((item) => item?.type === 'connection') ??
        []) as Connection[],
    [firecallItems]
  );
}
