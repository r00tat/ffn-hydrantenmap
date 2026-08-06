'use client';

import { useMemo } from 'react';
import { orderBy } from 'firebase/firestore';
import {
  FAHRTENBUCH_PERSON_COLLECTION_ID,
  type FahrtenbuchPerson,
} from '../common/fahrtenbuch';
import { GROUP_COLLECTION_ID } from '../components/firebase/firestore';
import useFirebaseCollection from './useFirebaseCollection';

export default function useFahrtenbuchPersons(groupId?: string) {
  const persons = useFirebaseCollection<FahrtenbuchPerson>({
    // Empty string makes useFirebaseCollection build a null query and skip
    // the subscription entirely — an empty pathSegments array alone still
    // subscribes to the root `groups` collection, which no client may read.
    collectionName: groupId ? GROUP_COLLECTION_ID : '',
    pathSegments: groupId ? [groupId, FAHRTENBUCH_PERSON_COLLECTION_ID] : [],
    queryConstraints: [orderBy('name', 'asc')],
  });

  return useMemo(() => {
    const list = groupId ? (persons ?? []) : [];
    return {
      persons: list,
      activePersons: list.filter((p) => p.active !== false),
    };
  }, [groupId, persons]);
}
