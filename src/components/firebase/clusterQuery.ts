import {
  collection,
  endAt,
  getDocs,
  orderBy,
  query,
  startAt,
} from 'firebase/firestore';
import { geohashQueryBounds } from 'geofire-common';
import { GeohashCluster } from '../../common/gis-objects';
import { db } from './firebase';

/**
 * Geohash-Umkreissuche in der Cluster-Sammlung `clusters6`.
 *
 * Bewusst ohne Leaflet und ohne React: Neben den Kartenlayern greift auch der
 * KI-Assistent darauf zu, und der läuft auch auf Seiten ohne Karte (z.B. im
 * Einsatztagebuch). Ein Import von `Clusters.tsx` zöge dort den kompletten
 * Kartenbaum mit.
 *
 * Die Bounds decken mehr ab als den Radius — auf Distanz filtern muss der
 * Aufrufer (siehe `collectWaterSupplyCandidates`).
 */
export async function queryClusters(
  center: { lat: number; lng: number },
  radiusInM: number
): Promise<GeohashCluster[]> {
  const bounds = geohashQueryBounds([center.lat, center.lng], radiusInM);

  const snapshots = await Promise.all(
    bounds.map((b) =>
      getDocs(
        query(
          collection(db, 'clusters6'),
          orderBy('geohash'),
          startAt(b[0]),
          endAt(b[1])
        )
      )
    )
  );

  return snapshots
    .map((snap) => snap.docs)
    .flat()
    .map((doc) => doc.data() as GeohashCluster);
}
