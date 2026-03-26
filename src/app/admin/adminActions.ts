'use server';
import 'server-only';

import { UserRecordExtended } from '../../common/users';
import {
  CLUSTER_COLLECTION_ID,
  Firecall,
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  FIRECALL_LAYERS_COLLECTION_ID,
  GROUP_COLLECTION_ID,
  USER_COLLECTION_ID,
} from '../../components/firebase/firestore';
import { ALLOWED_COLLECTIONS } from '../../components/admin/clusterItemConfig';
import {
  firestore,
  getDevFirestore,
  getProdFirestore,
} from '../../server/firebase/admin';
import { setCustomClaimsForUser } from '../api/users/[uid]/updateUser';
import { actionAdminRequired } from '../auth';

export async function setAuthorizedToBool(): Promise<UserRecordExtended[]> {
  await actionAdminRequired();
  const badUsers = await firestore
    .collection(USER_COLLECTION_ID)
    .where('authorized', '==', 'on')
    .get();
  await Promise.all(
    badUsers.docs.map(async (user) =>
      firestore
        .collection(USER_COLLECTION_ID)
        .doc(user.id)
        .update({ authorized: true })
    )
  );
  return badUsers.docs.map(
    (user) =>
      ({ ...user.data(), uid: user.id } as unknown as UserRecordExtended)
  );
}

export async function setEmptyFirecallGroup() {
  await actionAdminRequired();
  const calls = (
    await firestore.collection(FIRECALL_COLLECTION_ID).get()
  ).docs.filter((call) => call.data().group === undefined);

  await Promise.all(
    calls.map((call) =>
      firestore
        .collection(FIRECALL_COLLECTION_ID)
        .doc(call.id)
        .update({ group: 'ffnd' })
    )
  );

  return calls.map(
    (call) =>
      ({
        ...call.data(),
        id: call.id,
      } as unknown as Firecall)
  );
}

export async function setCustomClaimsForAllUsers() {
  await actionAdminRequired();

  console.info(`BULK ACTION: setCustomClaimsForAllUsers`);

  const authorizedUsers = await firestore
    .collection(USER_COLLECTION_ID)
    .where('authorized', '==', true)
    .get();
  await Promise.all(
    authorizedUsers.docs.map(async (user) => {
      return setCustomClaimsForUser(user.id, {
        authorized: true,
        isAdmin: user.data().isAdmin,
        groups: user.data().groups || [],
      });
    })
  );
  console.info(`BULK ACTION COMPLETE: setCustomClaimsForAllUsers`);
  return authorizedUsers.docs.map(
    (user) =>
      ({
        name: user.data().name,
        email: user.data().email,
        uid: user.id,
      } as unknown as UserRecordExtended)
  );
}

export interface CopyCollectionResult {
  usersCount: number;
  groupsCount: number;
}

export interface OrphanedItemsResult {
  firecallId: string;
  firecallName: string;
  deletedLayers: {
    layerId: string;
    layerName: string;
    orphanedCount: number;
    orphanedItems: { id: string; name: string; type: string }[];
  }[];
  totalOrphaned: number;
}

export async function findOrphanedItems(): Promise<OrphanedItemsResult[]> {
  await actionAdminRequired();

  const results: OrphanedItemsResult[] = [];
  const firecalls = await firestore.collection(FIRECALL_COLLECTION_ID).get();

  for (const fc of firecalls.docs) {
    const fcRef = firestore
      .collection(FIRECALL_COLLECTION_ID)
      .doc(fc.id);
    const itemsRef = fcRef.collection(FIRECALL_ITEMS_COLLECTION_ID);
    // Layers are in a separate 'layer' subcollection
    const layersRef = fcRef.collection(FIRECALL_LAYERS_COLLECTION_ID);

    // Get all layers from the layer subcollection
    const allLayers = await layersRef.get();
    const activeLayers = new Set(
      allLayers.docs
        .filter((doc) => doc.data().deleted !== true)
        .map((doc) => doc.id)
    );
    const deletedLayerDocs = new Map(
      allLayers.docs
        .filter((doc) => doc.data().deleted === true)
        .map((doc) => [doc.id, doc.data().name || '(unnamed)'])
    );

    // Get all non-deleted items that have a layer reference
    const allItems = await itemsRef.get();
    const itemsWithLayer = allItems.docs.filter(
      (doc) =>
        doc.data().deleted !== true &&
        doc.data().layer
    );

    // Group orphaned items by layer ID
    const orphanedByLayer = new Map<
      string,
      { id: string; name: string; type: string }[]
    >();
    for (const doc of itemsWithLayer) {
      const layerId = doc.data().layer;
      if (activeLayers.has(layerId)) continue; // layer is active, not orphaned

      if (!orphanedByLayer.has(layerId)) {
        orphanedByLayer.set(layerId, []);
      }
      orphanedByLayer.get(layerId)!.push({
        id: doc.id,
        name: doc.data().name || '(unnamed)',
        type: doc.data().type || 'unknown',
      });
    }

    if (orphanedByLayer.size > 0) {
      const deletedLayerResults: OrphanedItemsResult['deletedLayers'] = [];
      for (const [layerId, items] of orphanedByLayer) {
        deletedLayerResults.push({
          layerId,
          layerName:
            deletedLayerDocs.get(layerId) || `(missing: ${layerId})`,
          orphanedCount: items.length,
          orphanedItems: items,
        });
      }
      results.push({
        firecallId: fc.id,
        firecallName: fc.data().name || '(unnamed)',
        deletedLayers: deletedLayerResults,
        totalOrphaned: deletedLayerResults.reduce(
          (sum, l) => sum + l.orphanedCount,
          0
        ),
      });
    }
  }

  return results;
}

export async function cleanupOrphanedItems(
  firecallId: string
): Promise<number> {
  await actionAdminRequired();

  const fcRef = firestore
    .collection(FIRECALL_COLLECTION_ID)
    .doc(firecallId);
  const itemsRef = fcRef.collection(FIRECALL_ITEMS_COLLECTION_ID);
  const layersRef = fcRef.collection(FIRECALL_LAYERS_COLLECTION_ID);

  // Get active layer IDs from the layer subcollection
  const allLayers = await layersRef.get();
  const activeLayers = new Set(
    allLayers.docs
      .filter((doc) => doc.data().deleted !== true)
      .map((doc) => doc.id)
  );

  // Find all non-deleted items with a layer that isn't active
  const allItems = await itemsRef.get();
  const orphaned = allItems.docs.filter(
    (doc) =>
      doc.data().deleted !== true &&
      doc.data().layer &&
      !activeLayers.has(doc.data().layer)
  );

  let totalFixed = 0;

  // Firestore batch limit is 500
  for (let i = 0; i < orphaned.length; i += 500) {
    const batch = firestore.batch();
    const chunk = orphaned.slice(i, i + 500);
    for (const doc of chunk) {
      batch.update(doc.ref, { deleted: true });
    }
    await batch.commit();
    totalFixed += chunk.length;
  }

  return totalFixed;
}

/**
 * Restore items that were incorrectly marked as deleted.
 * Un-deletes all items in the given firecall that belong to active layers.
 */
export async function restoreIncorrectlyDeletedItems(
  firecallId: string
): Promise<number> {
  await actionAdminRequired();

  const fcRef = firestore
    .collection(FIRECALL_COLLECTION_ID)
    .doc(firecallId);
  const itemsRef = fcRef.collection(FIRECALL_ITEMS_COLLECTION_ID);
  const layersRef = fcRef.collection(FIRECALL_LAYERS_COLLECTION_ID);

  // Get active layer IDs
  const allLayers = await layersRef.get();
  const activeLayers = new Set(
    allLayers.docs
      .filter((doc) => doc.data().deleted !== true)
      .map((doc) => doc.id)
  );

  // Find deleted items whose layer is actually active
  const allItems = await itemsRef.get();
  const wronglyDeleted = allItems.docs.filter(
    (doc) =>
      doc.data().deleted === true &&
      doc.data().layer &&
      activeLayers.has(doc.data().layer)
  );

  let totalRestored = 0;

  for (let i = 0; i < wronglyDeleted.length; i += 500) {
    const batch = firestore.batch();
    const chunk = wronglyDeleted.slice(i, i + 500);
    for (const doc of chunk) {
      batch.update(doc.ref, { deleted: false });
    }
    await batch.commit();
    totalRestored += chunk.length;
  }

  return totalRestored;
}

export interface DeletedItemInfo {
  id: string;
  name: string;
  type: string;
  layer?: string;
  layerName?: string;
  layerDeleted?: boolean;
  datum?: string;
}

export interface DeletedItemsResult {
  items: DeletedItemInfo[];
  /** Layers that are deleted but still have orphaned (non-deleted) items */
  orphanedLayers: {
    id: string;
    name: string;
    orphanedItemCount: number;
  }[];
}

export async function getDeletedItems(
  firecallId: string
): Promise<DeletedItemsResult> {
  await actionAdminRequired();

  const fcRef = firestore
    .collection(FIRECALL_COLLECTION_ID)
    .doc(firecallId);
  const itemsRef = fcRef.collection(FIRECALL_ITEMS_COLLECTION_ID);
  const layersRef = fcRef.collection(FIRECALL_LAYERS_COLLECTION_ID);

  // Build layer lookups
  const allLayers = await layersRef.get();
  const layerNames = new Map(
    allLayers.docs.map((doc) => [doc.id, doc.data().name || '(unnamed)'])
  );
  const deletedLayerIds = new Set(
    allLayers.docs
      .filter((doc) => doc.data().deleted === true)
      .map((doc) => doc.id)
  );

  // Get deleted items
  const deletedItems = await itemsRef
    .where('deleted', '==', true)
    .get();

  const items = deletedItems.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name || '(unnamed)',
      type: data.type || 'unknown',
      layer: data.layer,
      layerName: data.layer ? layerNames.get(data.layer) : undefined,
      layerDeleted: data.layer ? deletedLayerIds.has(data.layer) : undefined,
      datum: data.datum,
    };
  });

  // Find orphaned items: non-deleted items whose layer is deleted
  const allItems = await itemsRef.get();
  const orphanedByLayer = new Map<string, number>();
  for (const doc of allItems.docs) {
    const data = doc.data();
    if (
      data.deleted !== true &&
      data.layer &&
      deletedLayerIds.has(data.layer)
    ) {
      orphanedByLayer.set(
        data.layer,
        (orphanedByLayer.get(data.layer) || 0) + 1
      );
    }
  }

  const orphanedLayers = Array.from(orphanedByLayer.entries()).map(
    ([layerId, count]) => ({
      id: layerId,
      name: layerNames.get(layerId) || '(unnamed)',
      orphanedItemCount: count,
    })
  );

  return { items, orphanedLayers };
}

export async function restoreDeletedItems(
  firecallId: string,
  itemIds: string[],
  restoreLayer?: boolean
): Promise<{ itemsRestored: number; layerRestored: boolean }> {
  await actionAdminRequired();

  const fcRef = firestore
    .collection(FIRECALL_COLLECTION_ID)
    .doc(firecallId);
  const itemsRef = fcRef.collection(FIRECALL_ITEMS_COLLECTION_ID);

  let totalRestored = 0;
  let layerRestored = false;

  // If restoreLayer, find the layer for these items and restore it too
  if (restoreLayer && itemIds.length > 0) {
    // Read the first item to find its layer
    const firstItem = await itemsRef.doc(itemIds[0]).get();
    const layerId = firstItem.data()?.layer;
    if (layerId) {
      const layersRef = fcRef.collection(FIRECALL_LAYERS_COLLECTION_ID);
      const layerDoc = await layersRef.doc(layerId).get();
      if (layerDoc.exists && layerDoc.data()?.deleted === true) {
        await layersRef.doc(layerId).update({ deleted: false });
        // Also restore the layer item in the items collection
        const layerItems = await itemsRef
          .where('type', '==', 'layer')
          .get();
        for (const doc of layerItems.docs) {
          if (doc.id === layerId || doc.data().name === layerDoc.data()?.name) {
            await doc.ref.update({ deleted: false });
          }
        }
        layerRestored = true;
      }
    }
  }

  for (let i = 0; i < itemIds.length; i += 500) {
    const batch = firestore.batch();
    const chunk = itemIds.slice(i, i + 500);
    for (const id of chunk) {
      batch.update(itemsRef.doc(id), { deleted: false });
    }
    await batch.commit();
    totalRestored += chunk.length;
  }

  return { itemsRestored: totalRestored, layerRestored };
}

export async function restoreLayer(
  firecallId: string,
  layerId: string
): Promise<boolean> {
  await actionAdminRequired();

  const fcRef = firestore
    .collection(FIRECALL_COLLECTION_ID)
    .doc(firecallId);
  const layersRef = fcRef.collection(FIRECALL_LAYERS_COLLECTION_ID);
  const layerDoc = await layersRef.doc(layerId).get();

  if (!layerDoc.exists || layerDoc.data()?.deleted !== true) {
    return false;
  }

  await layersRef.doc(layerId).update({ deleted: false });

  // Also restore the layer entry in the items collection if it exists
  const itemsRef = fcRef.collection(FIRECALL_ITEMS_COLLECTION_ID);
  const layerItems = await itemsRef
    .where('type', '==', 'layer')
    .get();
  for (const doc of layerItems.docs) {
    if (doc.id === layerId || doc.data().name === layerDoc.data()?.name) {
      await doc.ref.update({ deleted: false });
    }
  }

  return true;
}

export async function copyUserAndGroupsToDev(): Promise<CopyCollectionResult> {
  await actionAdminRequired();

  console.info(`BULK ACTION: copyUserAndGroupsToDev`);

  const prodDb = getProdFirestore();
  const devDb = getDevFirestore();

  // Copy users collection
  const prodUsers = await prodDb.collection(USER_COLLECTION_ID).get();
  const devUsersRef = devDb.collection(USER_COLLECTION_ID);

  // Delete all existing users in dev
  const existingDevUsers = await devUsersRef.get();
  const deleteUserBatch = devDb.batch();
  existingDevUsers.docs.forEach((doc) => {
    deleteUserBatch.delete(doc.ref);
  });
  await deleteUserBatch.commit();

  // Copy all users from prod to dev
  const userBatch = devDb.batch();
  prodUsers.docs.forEach((doc) => {
    userBatch.set(devUsersRef.doc(doc.id), doc.data());
  });
  await userBatch.commit();

  // Copy groups collection
  const prodGroups = await prodDb.collection(GROUP_COLLECTION_ID).get();
  const devGroupsRef = devDb.collection(GROUP_COLLECTION_ID);

  // Delete all existing groups in dev
  const existingDevGroups = await devGroupsRef.get();
  const deleteGroupBatch = devDb.batch();
  existingDevGroups.docs.forEach((doc) => {
    deleteGroupBatch.delete(doc.ref);
  });
  await deleteGroupBatch.commit();

  // Copy all groups from prod to dev
  const groupBatch = devDb.batch();
  prodGroups.docs.forEach((doc) => {
    groupBatch.set(devGroupsRef.doc(doc.id), doc.data());
  });
  await groupBatch.commit();

  console.info(
    `BULK ACTION COMPLETE: copyUserAndGroupsToDev - ${prodUsers.size} users, ${prodGroups.size} groups`
  );

  return {
    usersCount: prodUsers.size,
    groupsCount: prodGroups.size,
  };
}

export interface CopyClusterDataResult {
  collections: Record<string, number>;
  clustersCount: number;
}

async function copyCollection(
  prodDb: FirebaseFirestore.Firestore,
  devDb: FirebaseFirestore.Firestore,
  collectionId: string
): Promise<number> {
  const prodDocs = await prodDb.collection(collectionId).get();
  const devRef = devDb.collection(collectionId);

  // Delete existing docs in dev
  const existingDev = await devRef.get();
  for (let i = 0; i < existingDev.docs.length; i += 500) {
    const batch = devDb.batch();
    existingDev.docs.slice(i, i + 500).forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
  }

  // Copy all docs from prod to dev (in batches of 500)
  for (let i = 0; i < prodDocs.docs.length; i += 500) {
    const batch = devDb.batch();
    prodDocs.docs.slice(i, i + 500).forEach((doc) => {
      batch.set(devRef.doc(doc.id), doc.data());
    });
    await batch.commit();
  }

  return prodDocs.size;
}

export async function copyClusterDataToDev(): Promise<CopyClusterDataResult> {
  await actionAdminRequired();

  console.info(`BULK ACTION: copyClusterDataToDev`);

  const prodDb = getProdFirestore();
  const devDb = getDevFirestore();

  const collections: Record<string, number> = {};

  // Copy all base collections
  for (const collectionId of ALLOWED_COLLECTIONS) {
    collections[collectionId] = await copyCollection(prodDb, devDb, collectionId);
  }

  // Copy clusters collection
  const clustersCount = await copyCollection(prodDb, devDb, CLUSTER_COLLECTION_ID);

  console.info(
    `BULK ACTION COMPLETE: copyClusterDataToDev - ${Object.entries(collections)
      .map(([k, v]) => `${v} ${k}`)
      .join(', ')}, ${clustersCount} clusters`
  );

  return { collections, clustersCount };
}
