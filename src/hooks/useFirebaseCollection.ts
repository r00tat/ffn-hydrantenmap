'use client';

import { collection, query, QueryConstraint, Query } from 'firebase/firestore';
import { useEffect, useState, useMemo } from 'react';
import { firestore } from '../components/firebase/firebase';
import { useFirestoreQuery } from './useFirestoreQuery';

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

  // Memoize the query to prevent re-subscribing on every render.
  // This requires that `pathSegments` and `queryConstraints` are stable.
  const memoizedQuery: Query<T> | null = useMemo(() => {
    if (!collectionName) {
      return null;
    }
    try {
      const coll = collection(firestore, collectionName, ...pathSegments);
      return query(coll, ...queryConstraints) as Query<T>;
    } catch (e) {
      console.error(e);
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionName, JSON.stringify(pathSegments), JSON.stringify(queryConstraints)]);

  const { value, loading, error } = useFirestoreQuery<T>(memoizedQuery);
  const [records, setRecords] = useState<Array<T>>([]);

  useEffect(() => {
    if (error) {
      console.error(`Error in useFirebaseCollection for ${collectionName}:`, error);
      setRecords([]);
      return;
    }

    if (value) {
      const newRecords = value.docs.map(
        (doc) => ({ ...doc.data({ serverTimestamps: 'estimate' }), id: doc.id } as T)
      );
      setRecords(filterFn ? newRecords.filter(filterFn) : newRecords);
    } else {
      setRecords([]);
    }
  }, [value, filterFn, error, collectionName]);

  // To match the previous hook's behavior, we are only returning the records.
  // You could also return `loading` and `error` from here if needed.
  return records;
}
