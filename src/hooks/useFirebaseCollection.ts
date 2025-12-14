'use client';

import { collection, query, QueryConstraint, Query } from 'firebase/firestore';
import { useEffect, useState, useMemo } from 'react';
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

  const [pathQuery, setPathQuery] = useState<{
    path: string[];
    queryConstraints: QueryConstraint[];
  }>({ path: [collectionName, ...pathSegments], queryConstraints });

  if (
    JSON.stringify(pathQuery.path) !==
      JSON.stringify([collectionName, ...pathSegments]) ||
    JSON.stringify(pathQuery.queryConstraints) !==
      JSON.stringify(queryConstraints)
  ) {
    setPathQuery({ path: [collectionName, ...pathSegments], queryConstraints });
  }

  // Memoize the query to prevent re-subscribing on every render.
  // This requires that `pathSegments` and `queryConstraints` are stable.
  const memoizedQuery: Query<T> | null = useMemo(() => {
    if (
      pathQuery.path.length === 0 ||
      !pathQuery.path[0] ||
      (pathQuery.path[0] == FIRECALL_COLLECTION_ID &&
        pathQuery.path.length > 1 &&
        pathQuery.path[1] === 'unknown')
    ) {
      return null;
    }
    try {
      const coll = collection(
        firestore,
        pathQuery.path[0],
        ...pathQuery.path.slice(1)
      );
      return query(coll, ...pathQuery.queryConstraints) as Query<T>;
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [pathQuery.path, pathQuery.queryConstraints]);

  const { value, loading, error, records } = useFirestoreQuery<T>(
    memoizedQuery,
    filterFn
  );

  // To match the previous hook's behavior, we are only returning the records.
  // You could also return `loading` and `error` from here if needed.
  return records;
}
