'use client';

import { useMemo } from 'react';
import { limit, orderBy, where, type QueryConstraint } from 'firebase/firestore';
import {
  FAHRTENBUCH_COLLECTION_ID,
  type FahrtenbuchEntry,
} from '../common/fahrtenbuch';
import { GROUP_COLLECTION_ID } from '../components/firebase/firestore';
import useFirebaseCollection from './useFirebaseCollection';

export interface UseFahrtenbuchEntriesOptions {
  vehicleId?: string;
  /**
   * Nur die Fahrten zu einem Einsatz. Die Sammelerfassung braucht genau die,
   * um bestehende Einträge zu erkennen — ein Fenster der jüngsten Fahrten
   * würde einen älteren Einsatz nicht mehr enthalten und Duplikate zulassen.
   */
  firecallId?: string;
  /** Anzahl der geladenen Einträge; die UI erhöht sie über „Mehr laden". */
  pageSize?: number;
}

export default function useFahrtenbuchEntries(
  groupId?: string,
  options: UseFahrtenbuchEntriesOptions = {},
) {
  const { vehicleId, firecallId, pageSize = 50 } = options;

  const queryConstraints = useMemo<QueryConstraint[]>(() => {
    const constraints: QueryConstraint[] = [];
    if (vehicleId) constraints.push(where('vehicleId', '==', vehicleId));
    if (firecallId) constraints.push(where('firecallId', '==', firecallId));
    constraints.push(where('deleted', '==', false));
    constraints.push(orderBy('abfahrt', 'desc'));
    constraints.push(limit(pageSize));
    return constraints;
  }, [vehicleId, firecallId, pageSize]);

  const entries = useFirebaseCollection<FahrtenbuchEntry>({
    // Empty string makes useFirebaseCollection build a null query and skip
    // the subscription entirely — an empty pathSegments array alone still
    // subscribes to the root `groups` collection, which no client may read,
    // and would combine with `queryConstraints` above into an invalid query
    // (no index exists for `deleted`/`abfahrt` on `groups` itself).
    collectionName: groupId ? GROUP_COLLECTION_ID : '',
    pathSegments: groupId ? [groupId, FAHRTENBUCH_COLLECTION_ID] : [],
    queryConstraints,
  });

  return useMemo(() => (groupId ? (entries ?? []) : []), [groupId, entries]);
}
