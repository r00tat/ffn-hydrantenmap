'use client';

import { useMemo } from 'react';
import useFirebaseCollection from './useFirebaseCollection';
import { FIRECALL_COLLECTION_ID } from '../components/firebase/firestore';
import {
  LIVE_LOCATION_COLLECTION_ID,
  isFresh,
  LiveLocation,
} from '../common/liveLocation';
import { useFirecallId } from './useFirecall';
import useFirebaseLogin from './useFirebaseLogin';

export interface DisplayableLiveLocation extends LiveLocation {
  id: string;
  /** epoch ms of updatedAt for opacity calc */
  updatedAtMs: number;
}

/** Narrow the unknown updatedAt field to a Firestore Timestamp duck-type. */
function hasToMillis(value: unknown): value is { toMillis: () => number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'toMillis' in value &&
    typeof (value as { toMillis: unknown }).toMillis === 'function'
  );
}

export function useLiveLocations(): DisplayableLiveLocation[] {
  const firecallId = useFirecallId();
  const { uid: myUid } = useFirebaseLogin();

  const pathSegments = useMemo(
    () => [firecallId, LIVE_LOCATION_COLLECTION_ID],
    [firecallId]
  );

  const records = useFirebaseCollection<LiveLocation & { id: string }>({
    collectionName: FIRECALL_COLLECTION_ID,
    pathSegments,
  });

  return useMemo(() => {
    if (!records) return [];
    return records
      .filter((r) => r.uid !== myUid)
      .map((r) => {
        const ts: unknown = r.updatedAt;
        const ms = hasToMillis(ts) ? ts.toMillis() : 0;
        return { ...r, id: r.id, updatedAtMs: ms };
      })
      .filter((r) => isFresh(r.updatedAtMs));
  }, [records, myUid]);
}
