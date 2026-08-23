'use client';

import { useMemo } from 'react';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  FirecallItem,
  Line,
  filterActiveItems,
} from '../components/firebase/firestore';
import useFirebaseCollection from './useFirebaseCollection';
import { useFirecallId } from './useFirecall';
import { useHistoryPathSegments } from './useMapEditor';

/**
 * Alle Linien des Einsatzes — die Grundlage für die Summe über die
 * Dammabschnitte.
 *
 * Gefiltert wird auf `line` und nicht auf „Dammlinie": Ob der Sandsackrechner an
 * einer Linie läuft, entscheidet `dammSumme`, und dort steht die Regel einmal.
 */
export default function useDammLinien(): Line[] {
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
      (firecallItems?.filter((item) => item?.type === 'line') ?? []) as Line[],
    [firecallItems]
  );
}
