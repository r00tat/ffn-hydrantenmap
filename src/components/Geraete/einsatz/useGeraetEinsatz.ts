'use client';

import { useMemo } from 'react';
import { GERAET_EINSATZ_COLLECTION, type GeraetEinsatz } from '../../../common/geraet';
import { useFirebaseCollectionState } from '../../../hooks/useFirebaseCollection';
import { FIRECALL_COLLECTION_ID } from '../../firebase/firestore';

export interface UseGeraetEinsatzResult {
  /** Neueste zuerst. */
  entries: GeraetEinsatz[];
  loading: boolean;
  /** Nur aus dem lokalen Cache — für `OfflineListHint`. */
  fromCache: boolean;
}

/**
 * Die Geräte- und Materialeinträge eines Einsatzes, live.
 *
 * Mit `includeMetadataChanges`, damit `fromCache` nach dem Abgleich mit dem
 * Server wieder `false` wird (siehe docs/offline-modus.md). Sortiert wird im
 * Speicher: Ein `orderBy` brächte nichts, die Liste eines Einsatzes ist kurz.
 */
export default function useGeraetEinsatz(firecallId?: string): UseGeraetEinsatzResult {
  const valid = !!firecallId && firecallId !== 'unknown';
  const state = useFirebaseCollectionState<GeraetEinsatz>({
    collectionName: valid ? FIRECALL_COLLECTION_ID : '',
    pathSegments: valid ? [firecallId, GERAET_EINSATZ_COLLECTION] : [],
    includeMetadataChanges: true,
  });

  return useMemo(() => {
    const entries = [...(state.records ?? [])].sort((a, b) =>
      (b.zeitpunkt ?? '').localeCompare(a.zeitpunkt ?? ''),
    );
    return { entries, loading: valid && state.loading, fromCache: state.fromCache };
  }, [state, valid]);
}
