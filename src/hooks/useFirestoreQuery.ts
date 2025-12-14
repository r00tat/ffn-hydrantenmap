'use client';

import { onSnapshot, Query, QuerySnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';

/**
 * Represents the return value of the `useFirestoreQuery` hook.
 * @template T The type of data in the Firestore collection.
 */
export type UseFirestoreQueryResult<T> = {
  /** The Firestore QuerySnapshot, or undefined if not yet loaded. */
  value: QuerySnapshot<T> | undefined;
  /** A boolean indicating if the data is currently being loaded. */
  loading: boolean;
  /** An Error object if an error occurred, otherwise undefined. */
  error: Error | undefined;

  /** array of elements returned by snapshot and filtered by optional filter function. */
  records: Array<T>;
};

/**
 * A React hook that subscribes to a Firestore query and returns the data, loading state, and error.
 *
 * @template T The type of data in the Firestore collection.
 * @param {Query<T> | null} query The Firestore query to subscribe to.
 *   **Important:** This query object should be memoized (e.g., with `useMemo`) to prevent
 *   unnecessary re-subscriptions on component re-renders.
 * @returns {UseFirestoreQueryResult<T>} An object containing the query snapshot, loading state, and any error.
 */
export const useFirestoreQuery = <T>(
  query: Query<T> | null,
  filterFn?: (element: T) => boolean
): UseFirestoreQueryResult<T> => {
  const [value, setValue] = useState<QuerySnapshot<T> | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [records, setRecords] = useState<Array<T>>([]);

  useEffect(() => {
    if (!query) {
      (async () => {
        setValue(undefined);
        setLoading(false);
        setError(undefined);
      })();
      return;
    }

    (async () => {
      setLoading(true);
    })();
    const unsubscribe = onSnapshot(
      query,
      (snapshot) => {
        setValue(snapshot as QuerySnapshot<T>);

        const newRecords = snapshot.docs.map(
          (doc) =>
            ({ ...doc.data({ serverTimestamps: 'estimate' }), id: doc.id } as T)
        );
        setRecords(filterFn ? newRecords.filter(filterFn) : newRecords);
        setLoading(false);
      },
      (err: Error) => {
        console.error('Error in useFirestoreQuery:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [filterFn, query]);

  return { value, loading, error, records };
};
