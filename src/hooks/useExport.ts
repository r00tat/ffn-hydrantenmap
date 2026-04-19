import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  writeBatch,
} from 'firebase/firestore';
import { addDoc, commitBatch, updateDoc } from '../lib/firestoreClient';
import { getBlob, getMetadata, getStorage, ref } from 'firebase/storage';
import { v4 as uuid } from 'uuid';
import app, { firestore } from '../components/firebase/firebase';
import {
  AuditLogEntry,
  DrawingStroke,
  FcAttachment,
  FcItemAttachment,
  FcMarker,
  Firecall,
  FIRECALL_AUDITLOG_COLLECTION_ID,
  FIRECALL_COLLECTION_ID,
  FIRECALL_HISTORY_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  FIRECALL_LAYERS_COLLECTION_ID,
  FIRECALL_LOCATIONS_COLLECTION_ID,
  FirecallHistory,
  FirecallItem,
  FirecallLayer,
  FirecallLocation,
} from '../components/firebase/firestore';
import { uploadFile } from '../components/inputs/FileUploader';
import { ChatMessage } from '../common/chat';
import {
  KostenersatzCalculation,
  KOSTENERSATZ_SUBCOLLECTION,
} from '../common/kostenersatz';
import { allSettled } from '../common/promise';

/** Exported drawing item with embedded strokes */
export interface ExportDrawingItem extends FirecallItem {
  type: 'drawing';
  strokes?: DrawingStroke[];
}

/** History entry with snapshot data */
export interface ExportHistoryEntry extends FirecallHistory {
  snapshotItems?: FirecallItem[];
  snapshotLayers?: FirecallLayer[];
}

/** Firecall attachment downloaded as base64 */
export interface ExportFirecallAttachment {
  name: string;
  mimeType?: string;
  data: string;
  originalUrl: string;
}

export interface FirecallExport extends Firecall {
  items: FirecallItem[];
  chat: ChatMessage[];
  layers: FirecallLayer[];
  history: ExportHistoryEntry[];
  locations: FirecallLocation[];
  kostenersatz: KostenersatzCalculation[];
  auditlog: AuditLogEntry[];
  firecallAttachments?: ExportFirecallAttachment[];
}

const storage = getStorage(app);

function removeBase64Prefix(b64String: string) {
  return b64String.substring(b64String.indexOf(',') + 1);
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () =>
      typeof reader.result === 'string'
        ? resolve(removeBase64Prefix(reader.result as string))
        : reject('wrong result');
    reader.readAsDataURL(blob);
  });
}

export async function downloadAttachmentBase64(
  srcUrl: FcItemAttachment
): Promise<FcAttachment> {
  if (srcUrl instanceof Object) {
    return srcUrl;
  }

  const src = ref(storage, srcUrl as string);
  // to be able to download directly from the bucket via the sdk
  // the cors policy needs to be set
  // https://firebase.google.com/docs/storage/web/download-files?hl=en#download_data_directly_from_the_sdk
  const blob = await getBlob(src);

  const result = await blobToBase64(blob);
  const meta = await getMetadata(src);

  return {
    name: src.name.substring(37),
    mimeType: meta.contentType,
    data: result,
  };
}

async function downloadFirecallAttachment(
  url: string
): Promise<ExportFirecallAttachment> {
  const src = ref(storage, url);
  const blob = await getBlob(src);
  const result = await blobToBase64(blob);
  const meta = await getMetadata(src);

  return {
    name: src.name.substring(37),
    mimeType: meta.contentType,
    data: result,
    originalUrl: url,
  };
}

/** Export drawing strokes for a single item */
async function exportDrawingStrokes(
  firecallDoc: ReturnType<typeof doc>,
  itemId: string
): Promise<DrawingStroke[]> {
  const strokesRef = collection(
    firecallDoc,
    FIRECALL_ITEMS_COLLECTION_ID,
    itemId,
    'stroke'
  );
  const snapshot = await getDocs(query(strokesRef, orderBy('order', 'asc')));
  return snapshot.docs.map((d) => {
    const raw = d.data() as Omit<DrawingStroke, 'points'> & {
      points: number[];
    };
    // Firestore stores points as flat [lat, lng, lat, lng, ...]
    const points: number[][] = [];
    for (let i = 0; i + 1 < raw.points.length; i += 2) {
      points.push([raw.points[i], raw.points[i + 1]]);
    }
    return { ...raw, points, id: d.id } as DrawingStroke & { id: string };
  });
}

/** Export snapshot subcollections for a history entry */
async function exportHistorySnapshot(
  firecallDoc: ReturnType<typeof doc>,
  historyId: string
): Promise<{ snapshotItems: FirecallItem[]; snapshotLayers: FirecallLayer[] }> {
  const historyRef = doc(
    firecallDoc,
    FIRECALL_HISTORY_COLLECTION_ID,
    historyId
  );

  const [itemsSnap, layersSnap] = await Promise.all([
    getDocs(query(collection(historyRef, FIRECALL_ITEMS_COLLECTION_ID))),
    getDocs(query(collection(historyRef, FIRECALL_LAYERS_COLLECTION_ID))),
  ]);

  return {
    snapshotItems: itemsSnap.docs.map(
      (d) => ({ ...d.data(), id: d.id }) as FirecallItem
    ),
    snapshotLayers: layersSnap.docs.map(
      (d) => ({ ...d.data(), id: d.id }) as FirecallLayer
    ),
  };
}

export async function exportFirecall(
  firecallId: string
): Promise<FirecallExport> {
  const firecallDoc = doc(firestore, FIRECALL_COLLECTION_ID, firecallId);
  const firecall = (await getDoc(firecallDoc)).data() as Firecall;

  const items = (
    await getDocs(query(collection(firecallDoc, FIRECALL_ITEMS_COLLECTION_ID)))
  ).docs.map((d) => ({ ...d.data(), id: d.id }) as FirecallItem);
  const chat = (await getDocs(query(collection(firecallDoc, 'chat')))).docs.map(
    (d) => ({ ...d.data(), id: d.id }) as ChatMessage
  );
  const layers = (
    await getDocs(query(collection(firecallDoc, FIRECALL_LAYERS_COLLECTION_ID)))
  ).docs.map((d) => ({ ...d.data(), id: d.id }) as FirecallLayer);
  const history = (
    await getDocs(query(collection(firecallDoc, FIRECALL_HISTORY_COLLECTION_ID)))
  ).docs.map((d) => ({ ...d.data(), id: d.id }) as FirecallHistory);
  const locations = (
    await getDocs(
      query(collection(firecallDoc, FIRECALL_LOCATIONS_COLLECTION_ID))
    )
  ).docs.map((d) => ({ ...d.data(), id: d.id }) as FirecallLocation);
  const kostenersatz = (
    await getDocs(query(collection(firecallDoc, KOSTENERSATZ_SUBCOLLECTION)))
  ).docs.map((d) => ({ ...d.data(), id: d.id }) as KostenersatzCalculation);
  const auditlog = (
    await getDocs(
      query(collection(firecallDoc, FIRECALL_AUDITLOG_COLLECTION_ID))
    )
  ).docs.map((d) => ({ ...d.data(), id: d.id }) as AuditLogEntry);

  // Export items with attachments and drawing strokes
  const exportItems = await Promise.all(
    items.map(async (item) => {
      if (item.type === 'marker') {
        const m = item as FcMarker;
        if (m.attachments) {
          m.attachments = await allSettled<FcAttachment>(
            m.attachments?.map(downloadAttachmentBase64)
          );
        }
        return m;
      }

      if (item.type === 'drawing' && item.id) {
        const strokes = await exportDrawingStrokes(firecallDoc, item.id);
        return { ...item, strokes } as ExportDrawingItem;
      }

      return item;
    })
  );

  // Export history entries with snapshot data
  const exportHistory: ExportHistoryEntry[] = await Promise.all(
    history.map(async (h) => {
      if (!h.id) return h as ExportHistoryEntry;
      const snapshot = await exportHistorySnapshot(firecallDoc, h.id);
      return { ...h, ...snapshot } as ExportHistoryEntry;
    })
  );

  // Export firecall-level attachments
  let firecallAttachments: ExportFirecallAttachment[] | undefined;
  if (firecall.attachments && firecall.attachments.length > 0) {
    firecallAttachments = await allSettled<ExportFirecallAttachment>(
      firecall.attachments.map(downloadFirecallAttachment)
    );
  }

  return {
    ...firecall,
    items: exportItems,
    chat,
    layers,
    history: exportHistory,
    locations,
    kostenersatz,
    auditlog,
    firecallAttachments,
  };
}

export const blobFromBase64String = (
  base64String: string,
  mimeType?: string
) => {
  const byteArray = Uint8Array.from(
    atob(base64String)
      .split('')
      .map((char) => char.charCodeAt(0))
  );
  return new Blob([byteArray], { type: mimeType });
};

/**
 * Firestore writeBatch has a 500 operation limit. This helper commits in chunks.
 *
 * Each chunk's commit is routed through `commitBatch` (→ `withFreshAuth`).
 * If a commit fails with an auth error, the central `withFreshAuth` wrapper
 * will refresh and retry only the failing chunk — previously committed chunks
 * remain in place.
 */
async function commitInBatches(
  operations: Array<{
    ref: ReturnType<typeof doc>;
    data: Record<string, unknown>;
  }>
) {
  const BATCH_LIMIT = 499;
  for (let i = 0; i < operations.length; i += BATCH_LIMIT) {
    const chunk = operations.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(firestore);
    chunk.forEach(({ ref: docRef, data }) => {
      batch.set(docRef, data);
    });
    await commitBatch(batch);
  }
}

export async function importFirecall(firecall: FirecallExport) {
  const {
    items,
    chat,
    layers,
    history,
    locations,
    kostenersatz,
    auditlog,
    firecallAttachments,
    id,
    ...firecallData
  } = firecall;

  const firecallDoc = await addDoc(
    collection(firestore, FIRECALL_COLLECTION_ID),
    firecallData
  );

  // Re-upload firecall-level attachments and update the firecall document
  if (firecallAttachments?.length) {
    const newUrls = await allSettled(
      firecallAttachments.map(async (a) => {
        const blob = blobFromBase64String(a.data, a.mimeType);
        const uploadRef = await uploadFile(firecallDoc.id, a.name, blob, {
          contentType: a.mimeType,
        });
        return uploadRef.toString();
      })
    );
    if (newUrls.length > 0) {
      await updateDoc(firecallDoc, { attachments: newUrls });
    }
  }

  const itemCol = collection(firecallDoc, FIRECALL_ITEMS_COLLECTION_ID);
  const chatCol = collection(firecallDoc, 'chat');
  const layerCol = collection(firecallDoc, FIRECALL_LAYERS_COLLECTION_ID);
  const historyCol = collection(firecallDoc, FIRECALL_HISTORY_COLLECTION_ID);
  const locationCol = collection(firecallDoc, FIRECALL_LOCATIONS_COLLECTION_ID);
  const kostenersatzCol = collection(firecallDoc, KOSTENERSATZ_SUBCOLLECTION);
  const auditlogCol = collection(
    firecallDoc,
    FIRECALL_AUDITLOG_COLLECTION_ID
  );

  // Upload marker attachments
  const importItems = await allSettled(
    items.map(async (i) => {
      if (i.type === 'marker') {
        const m = i as FcMarker;
        if (m.attachments) {
          m.attachments = await allSettled(
            m.attachments.map(async (m) => {
              if (typeof m === 'string') {
                return m;
              }
              const a = m as FcAttachment;
              const blob = blobFromBase64String(a.data, a.mimeType);
              const uploadRef = await uploadFile(firecallDoc.id, a.name, blob, {
                contentType: a.mimeType,
              });
              return uploadRef.toString();
            })
          );
        }
      }
      return i;
    })
  );

  // Import items (without drawing strokes in document data)
  const itemOps = importItems.map((item) => {
    const { strokes: _strokes, ...itemData } = item as ExportDrawingItem;
    return {
      ref: doc(itemCol, item.id || uuid()),
      data: itemData as unknown as Record<string, unknown>,
    };
  });
  await commitInBatches(itemOps);

  // Import drawing strokes as sub-subcollections
  const drawingItems = importItems.filter(
    (i) => i.type === 'drawing'
  ) as ExportDrawingItem[];
  for (const drawing of drawingItems) {
    if (drawing.strokes?.length && drawing.id) {
      const strokeOps = drawing.strokes.map((stroke) => {
        const { id: _id, ...strokeData } = stroke as DrawingStroke & {
          id?: string;
        };
        return {
          ref: doc(
            collection(
              firecallDoc,
              FIRECALL_ITEMS_COLLECTION_ID,
              drawing.id!,
              'stroke'
            )
          ),
          data: {
            ...strokeData,
            points: strokeData.points.flat(),
          } as unknown as Record<string, unknown>,
        };
      });
      await commitInBatches(strokeOps);
    }
  }

  // Import chat
  if (chat?.length) {
    await commitInBatches(
      chat.map((c) => ({
        ref: doc(chatCol, c.id || uuid()),
        data: c as unknown as Record<string, unknown>,
      }))
    );
  }

  // Import layers (keep IDs, as they are referenced by items)
  if (layers?.length) {
    await commitInBatches(
      layers.map((l) => ({
        ref: doc(layerCol, l.id || uuid()),
        data: l as unknown as Record<string, unknown>,
      }))
    );
  }

  // Import history entries with snapshot data
  if (history?.length) {
    // Prepare history doc refs so we can batch the entries themselves
    const historyRefs = history.map((h) => {
      const { snapshotItems: _si, snapshotLayers: _sl, ...historyData } =
        h as ExportHistoryEntry;
      const historyDocId = h.id || uuid();
      return {
        ref: doc(historyCol, historyDocId),
        data: historyData as unknown as Record<string, unknown>,
        entry: h as ExportHistoryEntry,
      };
    });

    // Write all history entries in batches
    await commitInBatches(
      historyRefs.map(({ ref: r, data }) => ({ ref: r, data }))
    );

    // Write snapshot sub-collections
    for (const { ref: historyDocRef, entry } of historyRefs) {
      const { snapshotItems, snapshotLayers } = entry;

      if (snapshotItems?.length) {
        await commitInBatches(
          snapshotItems.map((item) => ({
            ref: doc(
              collection(historyDocRef, FIRECALL_ITEMS_COLLECTION_ID),
              item.id || uuid()
            ),
            data: item as unknown as Record<string, unknown>,
          }))
        );
      }

      if (snapshotLayers?.length) {
        await commitInBatches(
          snapshotLayers.map((layer) => ({
            ref: doc(
              collection(historyDocRef, FIRECALL_LAYERS_COLLECTION_ID),
              layer.id || uuid()
            ),
            data: layer as unknown as Record<string, unknown>,
          }))
        );
      }
    }
  }

  // Import locations
  if (locations?.length) {
    await commitInBatches(
      locations.map((l) => ({
        ref: doc(locationCol, l.id || uuid()),
        data: l as unknown as Record<string, unknown>,
      }))
    );
  }

  // Import kostenersatz
  if (kostenersatz?.length) {
    await commitInBatches(
      kostenersatz.map((k) => ({
        ref: doc(kostenersatzCol, k.id || uuid()),
        data: k as unknown as Record<string, unknown>,
      }))
    );
  }

  // Import auditlog
  if (auditlog?.length) {
    await commitInBatches(
      auditlog.map((a) => ({
        ref: doc(auditlogCol, a.id || uuid()),
        data: a as unknown as Record<string, unknown>,
      }))
    );
  }

  return firecallDoc;
}
