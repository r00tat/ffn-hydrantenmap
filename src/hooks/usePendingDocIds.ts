'use client';

import { collection, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { firestore } from '../components/firebase/firebase';
import useFirebaseLogin from './useFirebaseLogin';

const EMPTY: ReadonlySet<string> = new Set();

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

/**
 * IDs der Dokumente einer Sammlung, deren Änderungen erst auf dem Gerät liegen
 * (`snapshot.metadata.hasPendingWrites`) — für das Synchronisations-Symbol am
 * Eintrag.
 *
 * Ein eigener Listener mit `includeMetadataChanges: true` statt einer Option
 * in `useFirestoreQuery`: Metadaten-Änderungen lösten dort für jede Liste der
 * App zusätzliche Renders aus. Firestore teilt sich für dieselbe Abfrage ein
 * Target; der zweite Listener auf eine Sammlung, die die Seite ohnehin liest,
 * kostet keinen zweiten Abruf.
 */
export default function usePendingDocIds(
  pathSegments: string[] | null,
): ReadonlySet<string> {
  const { hasFirebaseUser } = useFirebaseLogin();
  const key =
    hasFirebaseUser &&
    pathSegments &&
    pathSegments.length > 0 &&
    pathSegments.every((s) => !!s && s !== 'unknown')
      ? pathSegments.join('/')
      : '';
  // Der Schlüssel steht mit im Zustand: Wechselt die Sammlung, gilt der alte
  // Stand nicht mehr, ohne dass im Effekt synchron zurückgesetzt werden muss.
  const [state, setState] = useState<{ key: string; ids: ReadonlySet<string> }>(
    { key: '', ids: EMPTY },
  );

  useEffect(() => {
    if (!key) return;
    const [first, ...rest] = key.split('/');
    return onSnapshot(
      collection(firestore, first, ...rest),
      { includeMetadataChanges: true },
      (snapshot) => {
        const next = new Set(
          snapshot.docs
            .filter((d) => d.metadata.hasPendingWrites)
            .map((d) => d.id),
        );
        setState((prev) =>
          prev.key === key && sameSet(prev.ids, next)
            ? prev
            : { key, ids: next.size > 0 ? next : EMPTY },
        );
      },
      (err) => {
        console.warn('usePendingDocIds: Listener fehlgeschlagen', err);
      },
    );
  }, [key]);

  return state.key === key ? state.ids : EMPTY;
}
