'use client';

import { collection, query, QueryConstraint } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { useCollection } from 'react-firebase-hooks/firestore';
import { firestore } from '../components/firebase/firebase';

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

  const [records, setRecords] = useState<Array<T>>([]);
  const [value, loading, error] = useCollection(
    query(
      collection(firestore, collectionName, ...pathSegments),
      ...queryConstraints
    )
  );

  useEffect(() => {
    if (value) {
      const records = value?.docs.map(
        (doc) => ({ ...doc.data(), id: doc.id } as unknown as T)
      );

      setRecords(filterFn ? records.filter(filterFn) : records);
    } else if (error) {
      setRecords([]);
    }
  }, [error, filterFn, value]);
  return records;
}
