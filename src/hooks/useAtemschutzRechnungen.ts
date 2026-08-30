'use client';

import { limit, orderBy, type QueryConstraint } from 'firebase/firestore';
import { useMemo } from 'react';
import {
  ATEMSCHUTZ_RECHNUNG_COLLECTION_ID,
  type AtemschutzRechnung,
} from '../common/atemschutzRechnung';
import { GROUP_COLLECTION_ID } from '../components/firebase/firestore';
import useFirebaseCollection from './useFirebaseCollection';

/** Schranke wie beim Füllprotokoll — keine Blätterfunktion. */
export const RECHNUNG_LIMIT = 200;

export default function useAtemschutzRechnungen(groupId?: string): AtemschutzRechnung[] {
  const queryConstraints = useMemo<QueryConstraint[]>(
    () => [orderBy('datum', 'desc'), limit(RECHNUNG_LIMIT)],
    [],
  );

  const rechnungen = useFirebaseCollection<AtemschutzRechnung>({
    // Leerer Name heißt: keine Subscription. Dasselbe Muster wie in
    // `useAtemschutzFuellungen` — ein leeres `pathSegments` abonnierte die
    // Wurzel-Collection `groups`, die kein Client lesen darf.
    collectionName: groupId ? GROUP_COLLECTION_ID : '',
    pathSegments: groupId ? [groupId, ATEMSCHUTZ_RECHNUNG_COLLECTION_ID] : [],
    queryConstraints,
  });

  return useMemo(() => (groupId ? (rechnungen ?? []) : []), [groupId, rechnungen]);
}
