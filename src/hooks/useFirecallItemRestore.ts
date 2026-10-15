'use client';

import {
  collection,
  deleteField,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { useCallback } from 'react';
import { restoreData } from '../common/auditAction';
import { firestore } from '../components/firebase/firebase';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_HISTORY_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  FirecallItem,
} from '../components/firebase/firestore';
import { commitBatchLocal, setDocLocal } from '../lib/firestoreClient';
import { cachedDocData } from './cachedDocData';
import { useAuditLog } from './useAuditLog';
import useFirebaseLogin from './useFirebaseLogin';
import { useFirecallId } from './useFirecall';

// Lazy wie in `useFirecallItemUpdate`: Die Registry der Elementklassen hängt
// an `leaflet` und schließt sonst einen Importkreis.
async function getFirebaseCollectionName(type: string | undefined) {
  const { getItemClass } = await import('../components/FirecallItems/elements');
  return getItemClass(type).firebaseCollectionName();
}

export interface RestoreOptions {
  /**
   * Der Stand stammt aus diesem Verlauf-Snapshot. Er ersetzt den aktuellen
   * Stand vollständig; bei einer Zeichnung kommen die Striche mit.
   */
  historyId?: string;
  /**
   * Nur die übergebenen Felder schreiben und den Rest des Dokuments behalten —
   * für den Vorzustand aus dem Audit-Log, der oft nur die geänderten Felder
   * enthält (z.B. `lat`/`lng` nach dem Verschieben).
   */
  merge?: boolean;
}

/**
 * Holt ein Element zurück: ein gelöschtes, einen Stand aus dem Verlauf oder den
 * Vorzustand eines Audit-Log-Eintrags. Das Element ist danach nicht gelöscht;
 * eine Ebene bringt die Elemente mit, die mit ihr gelöscht wurden.
 */
export default function useFirecallItemRestore() {
  const firecallId = useFirecallId();
  const { email } = useFirebaseLogin();
  const logChange = useAuditLog();

  return useCallback(
    async (item: FirecallItem, options: RestoreOptions = {}) => {
      if (!item.id || !firecallId || firecallId === 'unknown') return;
      const itemId = '' + item.id;
      const now = new Date().toISOString();
      const collectionName = await getFirebaseCollectionName(item.type);
      const itemRef = doc(
        firestore,
        FIRECALL_COLLECTION_ID,
        firecallId,
        collectionName,
        itemId
      );
      const previous = await cachedDocData(itemRef);
      const data = restoreData(item as unknown as Record<string, unknown>, {
        now,
        user: email,
      });
      if (options.merge) {
        // Ein früherer Stand hat das Feld nicht gehabt, das jetzige Dokument
        // trägt es noch: beim Zusammenführen ausdrücklich entfernen.
        data.deletedWithLayer = deleteField();
      }

      setDocLocal(itemRef, data, { merge: !!options.merge });

      logChange({
        action: 'restore',
        elementType: item.type,
        elementId: itemId,
        elementName: item.name || '',
        ...(previous ? { previousValue: previous } : {}),
        newValue: { ...data, deletedWithLayer: undefined },
      });

      if (options.historyId && item.type === 'drawing') {
        await restoreDrawingStrokes(firecallId, options.historyId, itemId);
      }

      if (item.type === 'layer') {
        await restoreLayerItems(firecallId, itemId, email, logChange);
      }
    },
    [email, firecallId, logChange]
  );
}

/**
 * Die Elemente, die mit der Ebene gelöscht wurden (`deletedWithLayer`),
 * kommen mit ihr zurück. Was vorher schon einzeln gelöscht war, bleibt
 * gelöscht.
 */
async function restoreLayerItems(
  firecallId: string,
  layerId: string,
  email: string | undefined | null,
  logChange: ReturnType<typeof useAuditLog>
) {
  const snapshot = await getDocs(
    query(
      collection(
        firestore,
        FIRECALL_COLLECTION_ID,
        firecallId,
        FIRECALL_ITEMS_COLLECTION_ID
      ),
      where('layer', '==', layerId)
    )
  );
  const deletedWithLayer = snapshot.docs.filter((d) => {
    const data = d.data();
    return data.deleted === true && data.deletedWithLayer === layerId;
  });
  if (deletedWithLayer.length === 0) return;

  const now = new Date().toISOString();
  const batch = writeBatch(firestore);
  deletedWithLayer.forEach((d) => {
    batch.update(d.ref, {
      deleted: false,
      deletedWithLayer: deleteField(),
      updatedAt: now,
      ...(email ? { updatedBy: email } : {}),
    });
  });
  commitBatchLocal(batch, `Ebene ${layerId} wiederherstellen`);
  deletedWithLayer.forEach((d) => {
    const data = d.data();
    logChange({
      action: 'restore',
      elementType: data.type,
      elementId: d.id,
      elementName: data.name || '',
      previousValue: data,
      newValue: { deleted: false },
    });
  });
}

/**
 * Die Striche einer Zeichnung liegen in der Untersammlung `stroke`. Der
 * Snapshot hat sie mitgesichert (`useSaveHistory`); beim Zurückholen ersetzen
 * sie die aktuellen Striche, sonst bliebe ein Mischbild aus beiden Ständen.
 */
async function restoreDrawingStrokes(
  firecallId: string,
  historyId: string,
  drawingId: string
) {
  const strokePath = [FIRECALL_ITEMS_COLLECTION_ID, drawingId, 'stroke'];
  const [snapshotStrokes, liveStrokes] = await Promise.all([
    getDocs(
      collection(
        firestore,
        FIRECALL_COLLECTION_ID,
        firecallId,
        FIRECALL_HISTORY_COLLECTION_ID,
        historyId,
        ...strokePath
      )
    ),
    getDocs(
      collection(firestore, FIRECALL_COLLECTION_ID, firecallId, ...strokePath)
    ),
  ]);

  const keep = new Set(snapshotStrokes.docs.map((d) => d.id));
  const batch = writeBatch(firestore);
  liveStrokes.docs
    .filter((d) => !keep.has(d.id))
    .forEach((d) => batch.delete(d.ref));
  snapshotStrokes.docs.forEach((d) => {
    batch.set(
      doc(firestore, FIRECALL_COLLECTION_ID, firecallId, ...strokePath, d.id),
      d.data()
    );
  });
  commitBatchLocal(batch, `Zeichnung ${drawingId} wiederherstellen`);
}
