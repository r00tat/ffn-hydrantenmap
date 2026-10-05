'use client';

import { useMemo } from 'react';
import { GERAET_SET_COLLECTION, type GeraetSet } from '../common/geraet';
import { GROUP_COLLECTION_ID } from '../components/firebase/firestore';
import { useFirebaseCollectionState } from './useFirebaseCollection';

export interface UseGeraetSetsResult {
  /** Alle Sets der Gruppe, nach Name sortiert (auch inaktive). */
  sets: GeraetSet[];
  loading: boolean;
  /** Ergebnis nur aus dem lokalen Cache (offline) — Liste ggf. unvollständig. */
  fromCache: boolean;
}

const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });

/**
 * Sets für Geräte und Material einer Gruppe, live über `onSnapshot`.
 *
 * Lesen dürfen Gruppenmitglieder, geschrieben wird nur über die Server
 * Actions. Ohne `groupId` keine Subscription — Einsatz-Gäste dürfen Sets
 * nicht lesen und bekommen eine leere Liste.
 */
export default function useGeraetSets(groupId?: string): UseGeraetSetsResult {
  const state = useFirebaseCollectionState<GeraetSet>({
    collectionName: groupId ? GROUP_COLLECTION_ID : '',
    pathSegments: groupId ? [groupId, GERAET_SET_COLLECTION] : [],
    includeMetadataChanges: true,
  });

  return useMemo(() => {
    if (!groupId) return { sets: [], loading: false, fromCache: false };
    const sets = [...(state.records ?? [])].sort((a, b) =>
      collator.compare(a.name ?? '', b.name ?? ''),
    );
    return { sets, loading: state.loading, fromCache: state.fromCache };
  }, [groupId, state]);
}
