'use client';

import {
  collection,
  onSnapshot,
  query,
  type QueryConstraint,
  type QuerySnapshot,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { firestore } from '../components/firebase/firebase';
import { GROUP_COLLECTION_ID } from '../components/firebase/firestore';
import { subscribeRetryingAfterPendingWrites } from '../lib/snapshotRetry';
import useFirebaseLogin from './useFirebaseLogin';

/** Ein Dokument samt der Gruppe, aus der es stammt. */
export type WithGroupId<T> = T & { id: string; groupId: string };

/** Stabiles leeres Ergebnis, damit ein noch leerer Listener keine Renders auslöst. */
const EMPTY: Array<never> = [];
const NO_CONSTRAINTS: readonly QueryConstraint[] = [];

/**
 * Dieselbe Untersammlung `groups/{groupId}/<subcollection>` aus mehreren
 * Gruppen, zusammengeführt.
 *
 * Ein Listener je Gruppe statt einer Collection-Group-Abfrage: Die Regeln
 * prüfen `member(groupId)` am Pfad, und genau das erfüllt jeder einzelne
 * Listener. Eine Collection-Group-Abfrage bräuchte ein Feld `groupId` in jedem
 * Dokument, eine Regel auf `resource.data` und einen eigenen Index.
 *
 * Jedes Dokument trägt `groupId` — nur zur Laufzeit, aus dem Pfad. Wer zu
 * einem Dokument schreibt (etwa einen Mangel an einer Flasche), braucht die
 * Gruppe, der es gehört, und nicht die, in der gerade gearbeitet wird.
 *
 * `queryConstraints` muss eine stabile Referenz sein (Modulkonstante oder
 * `useMemo`): Jede neue Liste meldet alle Listener ab und neu an.
 */
export default function useGroupsCollection<T>(
  groupIds: readonly string[],
  subcollection: string,
  queryConstraints: readonly QueryConstraint[] = NO_CONSTRAINTS,
): WithGroupId<T>[] {
  const { hasFirebaseUser } = useFirebaseLogin();

  // Eindeutig und ohne Leerwerte; die Reihenfolge bleibt die des Aufrufers.
  const groupsKey = JSON.stringify([...new Set(groupIds.filter(Boolean))]);

  const [byGroup, setByGroup] = useState<
    Record<string, QuerySnapshot<T> | undefined>
  >({});

  useEffect(() => {
    if (!hasFirebaseUser) return;
    const groups = JSON.parse(groupsKey) as string[];
    const unsubscribes = groups.map((groupId) => {
      const q = query(
        collection(firestore, GROUP_COLLECTION_ID, groupId, subcollection),
        ...queryConstraints,
      );
      return subscribeRetryingAfterPendingWrites(
        firestore,
        (handleError) =>
          onSnapshot(
            q,
            (snapshot) =>
              setByGroup((prev) => ({
                ...prev,
                [groupId]: snapshot as QuerySnapshot<T>,
              })),
            handleError,
          ),
        (err) =>
          console.error(
            `useGroupsCollection ${groupId}/${subcollection}:`,
            err,
          ),
      );
    });
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [groupsKey, subcollection, queryConstraints, hasFirebaseUser]);

  return useMemo(() => {
    if (!hasFirebaseUser) return EMPTY;
    const groups = JSON.parse(groupsKey) as string[];
    // Nur die aktuell verlangten Gruppen: Der Stand einer weggefallenen Gruppe
    // bleibt im State liegen, darf aber nicht mehr erscheinen.
    const records = groups.flatMap((groupId) =>
      (byGroup[groupId]?.docs ?? []).map(
        (doc) =>
          ({
            ...doc.data({ serverTimestamps: 'estimate' }),
            id: doc.id,
            groupId,
          }) as WithGroupId<T>,
      ),
    );
    return records.length > 0 ? records : EMPTY;
  }, [byGroup, groupsKey, hasFirebaseUser]);
}
