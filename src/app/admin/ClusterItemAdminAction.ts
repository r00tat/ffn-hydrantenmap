'use server';

import { geohashForLocation } from 'geofire-common';
import { GEOHASH_PRECISION } from '../../common/gis-objects';
import { ALLOWED_COLLECTIONS, ClusterCollectionType } from '../../components/admin/clusterItemConfig';
import { firestore } from '../../server/firebase/admin';
import { actionAdminRequired } from '../auth';

function validateCollection(collection: string): asserts collection is ClusterCollectionType {
  if (!ALLOWED_COLLECTIONS.includes(collection as ClusterCollectionType)) {
    throw new Error(`Invalid collection: ${collection}`);
  }
}

export async function saveClusterItem(
  collection: string,
  id: string | null,
  data: Record<string, unknown>
): Promise<string> {
  await actionAdminRequired();
  validateCollection(collection);

  // Compute geohash for hydrants
  if (collection === 'hydrant' && typeof data.lat === 'number' && typeof data.lng === 'number') {
    data.geohash = geohashForLocation([data.lat, data.lng], GEOHASH_PRECISION);
  }

  if (id) {
    await firestore.collection(collection).doc(id).set(data, { merge: true });
    return id;
  } else {
    const ref = firestore.collection(collection).doc();
    await ref.set(data);
    return ref.id;
  }
}

export async function deleteClusterItem(
  collection: string,
  id: string
): Promise<void> {
  await actionAdminRequired();
  validateCollection(collection);

  await firestore.collection(collection).doc(id).delete();
}
