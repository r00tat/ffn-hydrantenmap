import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { firestore } from '@shared/firebase';
import { Firecall, FIRECALL_COLLECTION_ID } from '@shared/types';

/**
 * Subscribe to firecalls the current user has access to.
 *
 * Mirrors the main app's query logic:
 * - If the user has a `firecall` claim → subscribe to that single doc
 * - Otherwise → query where group is in the user's groups
 *
 * The Firestore rules require this filter; querying without it
 * results in permission-denied.
 */
export function useFirecalls(groups: string[], firecallClaim?: string) {
  const [firecalls, setFirecalls] = useState<Firecall[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // No groups and no firecall claim → nothing to query
    if (groups.length === 0 && !firecallClaim) return;

    // Single firecall access via claim
    if (firecallClaim) {
      const unsubscribe = onSnapshot(
        doc(firestore, FIRECALL_COLLECTION_ID, firecallClaim),
        (snapshot) => {
          if (snapshot.exists()) {
            const fc = { id: snapshot.id, ...snapshot.data() } as Firecall;
            setFirecalls(fc.deleted ? [] : [fc]);
          } else {
            setFirecalls([]);
          }
          setLoading(false);
        },
        (error) => {
          console.error('Firecall subscription error:', error);
          setFirecalls([]);
          setLoading(false);
        }
      );
      return unsubscribe;
    }

    // Firestore 'in' operator supports max 30 values
    const queryGroups = groups.slice(0, 30);

    const q = query(
      collection(firestore, FIRECALL_COLLECTION_ID),
      where('deleted', '==', false),
      where('group', 'in', queryGroups),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const calls = snapshot.docs.map((d) => ({
          ...d.data(),
          id: d.id,
        })) as Firecall[];
        setFirecalls(calls);
        setLoading(false);
      },
      (error) => {
        console.error('Firecalls subscription error:', error);
        setFirecalls([]);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [groups, firecallClaim]);

  // Without any queryable scope, derive the empty state directly so we never
  // call setState from the effect body on the early-return branch.
  if (groups.length === 0 && !firecallClaim) {
    return { firecalls: [] as Firecall[], loading: false };
  }
  return { firecalls, loading };
}
