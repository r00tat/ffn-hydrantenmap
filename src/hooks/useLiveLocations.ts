'use client';

import { useMemo } from 'react';
import useFirebaseCollection from './useFirebaseCollection';
import { FIRECALL_COLLECTION_ID } from '../components/firebase/firestore';
import {
  LIVE_LOCATION_COLLECTION_ID,
  isFresh,
  liveLocationDocId,
  LiveLocation,
} from '../common/liveLocation';
import { liveLocationDeviceId } from '../common/liveLocationDevice';
import { useFirecallId } from './useFirecall';
import useFirebaseLogin from './useFirebaseLogin';

export interface DisplayableLiveLocation extends LiveLocation {
  id: string;
  /** epoch ms of updatedAt for opacity calc */
  updatedAtMs: number;
  /**
   * Ob das Gerät am Namen stehen soll. Nur wahr, wenn dieselbe Person mehrfach
   * auf der Karte steht — sonst hinge an jedem Marker ein „(Android)", das
   * nichts unterscheidet.
   */
  showDeviceLabel: boolean;
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

  const myDeviceId = liveLocationDeviceId();

  return useMemo(() => {
    if (!records) return [];

    // Ausgefiltert wird **genau dieses Gerät**, nicht das ganze Konto:
    // dieselbe Anmeldung auf Tablet und Desktop soll sich gegenseitig sehen
    // (die eigene Position kommt schon vom PositionMarker).
    //
    // Das Altdokument unter der bloßen uid gehört ausdrücklich *nicht* dazu.
    // Es ist nicht zwingend das eigene: genauso gut schreibt es ein zweites
    // Gerät desselben Kontos, das noch auf der Vorgängerversion läuft — und
    // das ist der Fall, um den es in #760 geht. Das eigene Altdokument fällt
    // von selbst weg: niemand schreibt es fort, also greift die
    // Frische-Grenze nach 5 Minuten, und beim ersten Teilen löscht
    // `useLiveLocationShare` es sofort.
    const ownDocId = myUid ? liveLocationDocId(myUid, myDeviceId) : undefined;

    const fresh = records
      .filter((r) => r.id !== ownDocId)
      .map((r) => {
        const ts: unknown = r.updatedAt;
        const ms = hasToMillis(ts) ? ts.toMillis() : 0;
        return { ...r, id: r.id, updatedAtMs: ms };
      })
      .filter((r) => isFresh(r.updatedAtMs));

    const perUid = new Map<string, number>();
    for (const r of fresh) {
      perUid.set(r.uid, (perUid.get(r.uid) ?? 0) + 1);
    }

    return fresh.map((r) => ({
      ...r,
      showDeviceLabel: (perUid.get(r.uid) ?? 0) > 1,
    }));
  }, [records, myUid, myDeviceId]);
}
