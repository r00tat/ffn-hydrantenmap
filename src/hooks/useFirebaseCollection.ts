'use client';

import { collection, query, QueryConstraint, Query } from 'firebase/firestore';
import { useMemo, useRef } from 'react';
import { firestore } from '../components/firebase/firebase';
import { useFirestoreQuery } from './useFirestoreQuery';
import { FIRECALL_COLLECTION_ID } from '../components/firebase/firestore';

export interface FirebaseCollectionOptions<T> {
  collectionName: string;
  queryConstraints?: QueryConstraint[];
  pathSegments?: string[];
  filterFn?: (element: T) => boolean;
}

export default function useFirebaseCollection<T>(
  options: FirebaseCollectionOptions<T>
) {
  const {
    collectionName,
    queryConstraints = [],
    pathSegments = [],
    filterFn,
  } = options;

  // Serialize path and constraints for stable dependency comparison
  const pathKey = JSON.stringify([collectionName, ...pathSegments]);
  const constraintsKey = JSON.stringify(queryConstraints);

  // Use refs to cache the actual values, updating only when serialized keys change
  const pathRef = useRef<string[]>([collectionName, ...pathSegments]);
  const constraintsRef = useRef<QueryConstraint[]>(queryConstraints);
  const pathKeyRef = useRef(pathKey);
  const constraintsKeyRef = useRef(constraintsKey);

  if (pathKeyRef.current !== pathKey) {
    pathKeyRef.current = pathKey;
    pathRef.current = [collectionName, ...pathSegments];
  }
  if (constraintsKeyRef.current !== constraintsKey) {
    constraintsKeyRef.current = constraintsKey;
    constraintsRef.current = queryConstraints;
  }

  // Memoize the query to prevent re-subscribing on every render.
  // Uses serialized keys for stable dependency tracking.
  const memoizedQuery: Query<T> | null = useMemo(() => {
    const path = pathRef.current;
    if (
      path.length === 0 ||
      !path[0] ||
      (path[0] === FIRECALL_COLLECTION_ID &&
        path.length > 1 &&
        path[1] === 'unknown')
    ) {
      return null;
    }
    try {
      const coll = collection(firestore, path[0], ...path.slice(1));
      return query(coll, ...constraintsRef.current) as Query<T>;
    } catch (e) {
      console.error(e);
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathKey, constraintsKey]);

  const { value, loading, error, records } = useFirestoreQuery<T>(
    memoizedQuery,
    filterFn
  );

  // To match the previous hook's behavior, we are only returning the records.
  // You could also return `loading` and `error` from here if needed.
  return records;
}
