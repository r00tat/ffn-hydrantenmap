import 'server-only';

import { clusterQueryBounds } from '../../common/clusterGeohash';
import { GeohashCluster } from '../../common/gis-objects';
import { CLUSTER_COLLECTION_ID } from '../../components/firebase/firestore';
import { firestore } from '../firebase/admin';

/**
 * Serverseitige Entsprechung von `components/firebase/clusterQuery.ts`.
 *
 * Dieselbe Geohash-Umkreissuche, nur über das Admin SDK: Der MCP-Server hat
 * keinen angemeldeten Firebase-Client, seine Berechtigung kommt aus dem
 * geprüften Access Token. Die Bounds-Berechnung selbst ist geteilt
 * (`clusterQueryBounds`) — sie ist der Teil, bei dem eine Abweichung still zu
 * falschen Ergebnissen führte.
 */
export async function queryClustersAdmin(
  center: { lat: number; lng: number },
  radiusInM: number,
): Promise<GeohashCluster[]> {
  const bounds = clusterQueryBounds(center, radiusInM);

  const snapshots = await Promise.all(
    bounds.map((b) =>
      firestore
        .collection(CLUSTER_COLLECTION_ID)
        .orderBy('geohash')
        .startAt(b[0])
        .endAt(b[1])
        .get(),
    ),
  );

  return snapshots.flatMap((snap) =>
    snap.docs.map((doc) => doc.data() as GeohashCluster),
  );
}
