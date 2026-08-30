'use client';

import { orderBy, type QueryConstraint } from 'firebase/firestore';
import { useMemo } from 'react';
import {
  ATEMSCHUTZ_EMPFAENGER_COLLECTION_ID,
  type AtemschutzEmpfaenger,
} from '../common/atemschutzRechnung';
import { GROUP_COLLECTION_ID } from '../components/firebase/firestore';
import useFirebaseCollection from './useFirebaseCollection';

export default function useAtemschutzEmpfaenger(
  groupId?: string,
): AtemschutzEmpfaenger[] {
  const queryConstraints = useMemo<QueryConstraint[]>(
    () => [orderBy('name', 'asc')],
    [],
  );

  const empfaenger = useFirebaseCollection<AtemschutzEmpfaenger>({
    collectionName: groupId ? GROUP_COLLECTION_ID : '',
    pathSegments: groupId ? [groupId, ATEMSCHUTZ_EMPFAENGER_COLLECTION_ID] : [],
    queryConstraints,
  });

  return useMemo(
    () => (groupId ? (empfaenger ?? []) : []),
    [groupId, empfaenger],
  );
}
