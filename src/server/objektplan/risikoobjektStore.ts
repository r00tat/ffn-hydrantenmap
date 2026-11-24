import 'server-only';

import { geohashForLocation } from 'geofire-common';
import { GEOHASH_PRECISION, type RisikoObjekt } from '../../common/gis-objects';
import {
  objektDokumentCollectionPath,
  type ObjektDokument,
} from '../../common/objektplan/objektDokument';
import {
  removeClusterEntry,
  storageGroupsMetadata,
  upsertClusterEntry,
} from '../../common/objektplan/risikoobjektAccess';
import { firestore } from '../firebase/admin';
import { getDefaultStorageBucket } from '../firebase/storageBucket';

/**
 * Schreibzugriffe auf Risikoobjekte für die Server Actions. Jede Änderung am
 * Objekt zieht die Kopie im Cluster nach: Die Karte liest `clusters6`, und
 * ein in der App angelegtes Objekt soll dort sofort stehen, nicht erst nach
 * `updateClusters`. Hintergrund: docs/objektplaene.md.
 */

const COLLECTION = 'risikoobjekt';
const CLUSTER_COLLECTION = `clusters${GEOHASH_PRECISION}`;

export type RisikoObjektWithId = RisikoObjekt & { id: string };

function hashOf(o: { lat?: number; lng?: number }): string {
  return geohashForLocation([o.lat || 0, o.lng || 0], GEOHASH_PRECISION);
}

export async function loadRisikoObjekt(id: string): Promise<RisikoObjektWithId | undefined> {
  const snap = await firestore.collection(COLLECTION).doc(id).get();
  return snap.exists ? ({ ...(snap.data() as RisikoObjekt), id: snap.id }) : undefined;
}

export async function loadAllRisikoObjekte(): Promise<RisikoObjektWithId[]> {
  const snap = await firestore.collection(COLLECTION).get();
  return snap.docs.map((d) => ({ ...(d.data() as RisikoObjekt), id: d.id }));
}

/** Neue ID für ein in der App angelegtes Objekt. */
export function newRisikoObjektId(): string {
  return firestore.collection(COLLECTION).doc().id;
}

/**
 * Schreibt das Objekt (Felder werden zusammengeführt) und seinen Eintrag im
 * Cluster, in einer Transaktion. Wandert das Objekt in ein anderes
 * Geohash-Feld, verschwindet es aus dem alten.
 */
export async function saveRisikoObjekt(
  id: string,
  patch: Partial<RisikoObjekt>,
): Promise<RisikoObjektWithId> {
  const ref = firestore.collection(COLLECTION).doc(id);
  return firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const before = snap.exists ? (snap.data() as RisikoObjekt) : undefined;
    const merged = { ...before, ...patch } as RisikoObjekt;
    delete (merged as { id?: string }).id;
    const after: RisikoObjektWithId = { ...merged, id };

    const newHash = hashOf(after);
    const oldHash = before ? hashOf(before) : undefined;
    const newClusterRef = firestore.collection(CLUSTER_COLLECTION).doc(newHash);
    const oldClusterRef =
      oldHash && oldHash !== newHash
        ? firestore.collection(CLUSTER_COLLECTION).doc(oldHash)
        : undefined;
    // Erst alles lesen, dann schreiben — so verlangt es die Transaktion.
    const newCluster = await tx.get(newClusterRef);
    const oldCluster = oldClusterRef ? await tx.get(oldClusterRef) : undefined;

    tx.set(ref, merged);
    if (oldClusterRef && oldCluster?.exists) {
      tx.set(
        oldClusterRef,
        { risikoobjekt: removeClusterEntry(oldCluster.get('risikoobjekt'), id) },
        { merge: true },
      );
    }
    tx.set(
      newClusterRef,
      {
        ...(newCluster.exists ? {} : { geohash: newHash, hydranten: [] }),
        risikoobjekt: upsertClusterEntry(
          newCluster.exists ? newCluster.get('risikoobjekt') : undefined,
          after,
        ),
      },
      { merge: true },
    );
    return after;
  });
}

/** Entfernt Objekt, Cluster-Eintrag, alle Unterlagen und ihre Dateien. */
export async function deleteRisikoObjektCompletely(objekt: RisikoObjektWithId): Promise<void> {
  const dokumente = await firestore.collection(objektDokumentCollectionPath(objekt.id)).get();
  for (const d of dokumente.docs) await d.ref.delete();
  await deleteStorageFolder(objekt.id);

  const clusterRef = firestore.collection(CLUSTER_COLLECTION).doc(hashOf(objekt));
  await firestore.runTransaction(async (tx) => {
    const cluster = await tx.get(clusterRef);
    tx.delete(firestore.collection(COLLECTION).doc(objekt.id));
    if (cluster.exists) {
      tx.set(
        clusterRef,
        { risikoobjekt: removeClusterEntry(cluster.get('risikoobjekt'), objekt.id) },
        { merge: true },
      );
    }
  });
}

function storagePrefix(objektId: string): string {
  return `risikoobjekt/${objektId}/`;
}

async function deleteStorageFolder(objektId: string): Promise<void> {
  const bucket = await getDefaultStorageBucket();
  await bucket.deleteFiles({ prefix: storagePrefix(objektId) });
}

/**
 * Schreibt die Freigabe an alle Dateien des Objekts — die Storage-Regel liest
 * sie dort. Nötig nach jeder Änderung von `groups`.
 */
export async function writeStorageGroups(objektId: string, groups: string[]): Promise<number> {
  const bucket = await getDefaultStorageBucket();
  const [files] = await bucket.getFiles({ prefix: storagePrefix(objektId) });
  const value = storageGroupsMetadata(groups);
  for (const file of files) {
    await file.setMetadata({ metadata: { groups: value } });
  }
  return files.length;
}

export async function loadObjektDokument(
  objektId: string,
  dokumentId: string,
): Promise<ObjektDokument | undefined> {
  const snap = await firestore
    .collection(objektDokumentCollectionPath(objektId))
    .doc(dokumentId)
    .get();
  return snap.exists ? ({ ...(snap.data() as ObjektDokument), id: snap.id }) : undefined;
}

/** Löscht eine Unterlage samt Datei; eine fehlende Datei ist kein Fehler. */
export async function deleteObjektDokumentCompletely(
  objektId: string,
  dokument: ObjektDokument,
): Promise<void> {
  await firestore.collection(objektDokumentCollectionPath(objektId)).doc(dokument.id).delete();
  try {
    const bucket = await getDefaultStorageBucket();
    await bucket.file(dokument.storagePath).delete({ ignoreNotFound: true });
  } catch (err) {
    console.warn('Datei der Unterlage nicht gelöscht', dokument.storagePath, err);
  }
}

export async function writeObjektDokument(objektId: string, dokument: ObjektDokument): Promise<void> {
  await firestore.collection(objektDokumentCollectionPath(objektId)).doc(dokument.id).set(dokument);
}

/** Überblick der Unterlagen eines Objekts — ohne den Seitentext, der groß sein kann. */
export async function loadObjektDokumentSummaries(
  objektId: string,
): Promise<Array<Pick<ObjektDokument, 'id' | 'name' | 'contentType' | 'indexStatus' | 'ocr' | 'melder'>>> {
  const snap = await firestore
    .collection(objektDokumentCollectionPath(objektId))
    .select('name', 'contentType', 'indexStatus', 'ocr', 'melder')
    .get();
  return snap.docs.map((d) => ({
    ...(d.data() as Pick<ObjektDokument, 'name' | 'contentType' | 'indexStatus' | 'ocr' | 'melder'>),
    id: d.id,
  }));
}
