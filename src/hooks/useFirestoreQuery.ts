'use client';

import { onSnapshot, Query, QuerySnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';

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

  /**
   * Stammt das Ergebnis nur aus dem lokalen Cache (`snapshot.metadata.fromCache`)?
   * Offline liefert eine nie geladene Abfrage eine leere Liste statt eines
   * Fehlers — dieses Feld unterscheidet „leer" von „unbekannt". Verlässlich
   * nur mit `includeMetadataChanges`: ohne meldet der Listener den Wechsel
   * vom Cache- zum Server-Stand nicht, wenn sich kein Dokument ändert.
   */
  fromCache: boolean;
};

export interface UseFirestoreQueryOptions {
  /** Auch reine Metadaten-Änderungen melden (für `fromCache`). */
  includeMetadataChanges?: boolean;
}

/** Stabiles leeres Ergebnis, damit ein noch leerer Listener keine Renders auslöst. */
const EMPTY_RECORDS: Array<never> = [];

/**
 * A React hook that subscribes to a Firestore query and returns the data, loading state, and error.
 *
 * @template T The type of data in the Firestore collection.
 * @param {Query<T> | null} query The Firestore query to subscribe to.
 *   **Important:** This query object should be memoized (e.g., with `useMemo`) to prevent
 *   unnecessary re-subscriptions on component re-renders.
 * @param {(element: T) => boolean} [filterFn] Filter über das Ergebnis. Der Filter
 *   wird auf den zuletzt empfangenen Snapshot angewendet und hängt bewusst
 *   **nicht** am Listener: eine inline definierte Funktion ist bei jedem Render
 *   eine neue Referenz, und ein daran hängender Listener meldete den Firestore-
 *   Target bei jedem Render ab und neu an. Da jeder Snapshot wieder einen Render
 *   auslöste, lief das endlos.
 * @returns {UseFirestoreQueryResult<T>} An object containing the query snapshot, loading state, and any error.
 */
export const useFirestoreQuery = <T>(
  query: Query<T> | null,
  filterFn?: (element: T) => boolean,
  options: UseFirestoreQueryOptions = {}
): UseFirestoreQueryResult<T> => {
  const includeMetadataChanges = options.includeMetadataChanges === true;
  const [value, setValue] = useState<QuerySnapshot<T> | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>(undefined);

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
    const next = (snapshot: QuerySnapshot<T>) => {
      setValue(snapshot);
      setLoading(false);
    };
    const onError = (err: Error) => {
      console.error('Error in useFirestoreQuery:', err);
      setError(err);
      setLoading(false);
    };
    // Die Optionen nur, wenn sie gebraucht werden: Metadaten-Änderungen
    // (etwa `hasPendingWrites`) lösen sonst bei jedem Schreibvorgang einen
    // zusätzlichen Render der ganzen Liste aus.
    const unsubscribe = includeMetadataChanges
      ? onSnapshot(query, { includeMetadataChanges: true }, next, onError)
      : onSnapshot(query, next, onError);

    return () => unsubscribe();
  }, [query, includeMetadataChanges]);

  const records = useMemo(() => {
    if (!value) {
      return EMPTY_RECORDS as Array<T>;
    }
    const newRecords = value.docs.map(
      (doc) =>
        ({ ...doc.data({ serverTimestamps: 'estimate' }), id: doc.id } as T)
    );
    return filterFn ? newRecords.filter(filterFn) : newRecords;
  }, [value, filterFn]);

  const fromCache = value?.metadata?.fromCache === true;

  return { value, loading, error, records, fromCache };
};
