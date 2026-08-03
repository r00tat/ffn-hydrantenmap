'use client';

import { limit, orderBy, where, type QueryConstraint } from 'firebase/firestore';
import { useMemo } from 'react';
import type { FahrtenbuchFirecallOption } from '../components/Fahrtenbuch/FahrtenbuchDialog';
import {
  FIRECALL_COLLECTION_ID,
  type Firecall,
} from '../components/firebase/firestore';
import useFirebaseCollection from './useFirebaseCollection';

/**
 * Die letzten Einsätze einer Gruppe als Auswahl für den Eintrags-Dialog.
 *
 * Die Query entspricht der Einsatzliste in `components/pages/Einsaetze.tsx`
 * (dort mit `group in [...]` statt `group ==`) und wird vom bestehenden
 * Composite-Index `deleted ASC, group ASC, date DESC` auf `call` bedient.
 */
export default function useFahrtenbuchFirecalls(
  groupId?: string,
): FahrtenbuchFirecallOption[] {
  const queryConstraints = useMemo<QueryConstraint[]>(
    () =>
      groupId
        ? [
            where('deleted', '==', false),
            where('group', '==', groupId),
            orderBy('date', 'desc'),
            limit(50),
          ]
        : [],
    [groupId],
  );

  const firecalls = useFirebaseCollection<Firecall>({
    // Empty string makes useFirebaseCollection build a null query and skip the
    // subscription entirely — without a group there is nothing to select from.
    collectionName: groupId ? FIRECALL_COLLECTION_ID : '',
    queryConstraints,
  });

  return useMemo(() => {
    if (!groupId) return [];
    return (firecalls ?? []).map((f) => ({
      id: f.id as string,
      name: f.name,
      date: f.date,
      abruecken: f.abruecken,
    }));
  }, [groupId, firecalls]);
}
