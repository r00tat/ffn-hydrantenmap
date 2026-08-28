import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
} from 'firebase/firestore';
import { addDoc, commitInBatches, updateDoc } from '../lib/firestoreClient';
import { getBlob, getMetadata, getStorage, ref } from 'firebase/storage';
import { v4 as uuid } from 'uuid';
import app, { firestore } from '../components/firebase/firebase';
import {
  AuditLogEntry,
  CrewAssignment,
  DrawingStroke,
  FcAttachment,
  FcItemAttachment,
  FcMarker,
  Firecall,
  FIRECALL_AUDITLOG_COLLECTION_ID,
  FIRECALL_COLLECTION_ID,
  FIRECALL_CREW_COLLECTION_ID,
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
import { displayFileName, storageFileName } from '../common/attachmentName';

/**
 * Format des Sicherungs-JSON. Wird beim Export mitgeschrieben, damit ein
 * künftiger Import eine ältere Datei erkennen und migrieren kann. Dateien ohne
 * das Feld stammen aus der Zeit davor und gelten als Version 1.
 */
export const BACKUP_VERSION = 1;

/**
 * Was beim Sichern oder Zurückspielen nicht geklappt hat.
 *
 * Vorher verschwanden solche Fehler in einem `console.warn`: Ein Anhang, der
 * sich nicht herunterladen ließ, fehlte im Backup, und die Datei sah dabei
 * vollständig aus. Bei einer Sicherungsfunktion ist genau das die gefährlichste
 * Eigenschaft, deshalb reicht der Aufrufer einen `onWarning`-Rückruf herein und
 * zeigt die Meldungen an.
 */
export interface BackupWarning {
  code:
    | 'attachmentDownloadFailed'
    | 'attachmentUploadFailed'
    | 'newerBackupVersion';
  /** Dateiname bzw. Fundstelle, soweit bekannt. */
  file?: string;
  detail?: string;
}

export type BackupWarningHandler = (warning: BackupWarning) => void;

/**
 * Wie `Promise.allSettled`, meldet Fehlschläge aber nach oben statt sie nur zu
 * protokollieren.
 */
async function settleReporting<T>(
  tasks: { label: string; run: () => Promise<T> }[],
  code: BackupWarning['code'],
  onWarning?: BackupWarningHandler
): Promise<T[]> {
  const results = await Promise.allSettled(tasks.map((task) => task.run()));

  return results.flatMap((result, index) => {
    if (result.status === 'fulfilled') {
      return [result.value];
    }
    console.warn(result.reason);
    onWarning?.({
      code,
      file: tasks[index].label,
      detail: `${result.reason}`,
    });
    return [];
  });
}

/** Exported drawing item with embedded strokes */
export interface ExportDrawingItem extends FirecallItem {
  type: 'drawing';
  strokes?: DrawingStroke[];
}

/** History entry with snapshot data */
export interface ExportHistoryEntry extends FirecallHistory {
  /**
   * Zeichnungen im Snapshot tragen ihre Striche mit — die liegen in der
   * Untersammlung `stroke` und nicht im Item-Dokument.
   */
  snapshotItems?: (FirecallItem | ExportDrawingItem)[];
  snapshotLayers?: FirecallLayer[];
}

/** Firecall attachment downloaded as base64 */
export interface ExportFirecallAttachment {
  name: string;
  mimeType?: string;
  data: string;
  originalUrl: string;
}

/**
 * Der komplette Einsatz als eine Datei.
 *
 * `call/{id}/livelocation` bleibt bewusst draußen: die Standorte sind nur
 * während des laufenden Einsatzes gültig und in einer Kopie irreführend. Die
 * Einsatz-Fotos im Google Drive ebenso — gesichert wird nur `driveFolderId`,
 * siehe `docs/einsatz-backup.md`.
 */
export interface FirecallExport extends Firecall {
  /** Format der Datei, siehe `BACKUP_VERSION`. */
  backupVersion?: number;
  items: FirecallItem[];
  chat: ChatMessage[];
  layers: FirecallLayer[];
  history: ExportHistoryEntry[];
  locations: FirecallLocation[];
  kostenersatz: KostenersatzCalculation[];
  auditlog: AuditLogEntry[];
  /** Besatzung je Fahrzeug — `call/{id}/crew`. */
  crew?: CrewAssignment[];
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
    name: displayFileName(src.name),
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
    name: displayFileName(src.name),
    mimeType: meta.contentType,
    data: result,
    originalUrl: url,
  };
}

/** Bezeichnung eines Anhangs für Warnmeldungen. */
function attachmentLabel(attachment: FcItemAttachment): string {
  return typeof attachment === 'string' ? attachment : attachment.name;
}

/**
 * Die Striche einer Zeichnung.
 *
 * `parentDoc` ist der Einsatz oder ein History-Eintrag — unter beiden liegt
 * dieselbe Struktur `item/{id}/stroke`.
 */
async function exportDrawingStrokes(
  parentDoc: ReturnType<typeof doc>,
  itemId: string
): Promise<DrawingStroke[]> {
  const strokesRef = collection(
    parentDoc,
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
): Promise<{
  snapshotItems: (FirecallItem | ExportDrawingItem)[];
  snapshotLayers: FirecallLayer[];
}> {
  const historyRef = doc(
    firecallDoc,
    FIRECALL_HISTORY_COLLECTION_ID,
    historyId
  );

  const [itemsSnap, layersSnap] = await Promise.all([
    getDocs(query(collection(historyRef, FIRECALL_ITEMS_COLLECTION_ID))),
    getDocs(query(collection(historyRef, FIRECALL_LAYERS_COLLECTION_ID))),
  ]);

  const snapshotItems = await Promise.all(
    itemsSnap.docs.map(async (d) => {
      const item = { ...d.data(), id: d.id } as FirecallItem;
      if (item.type !== 'drawing') {
        return item;
      }
      const strokes = await exportDrawingStrokes(historyRef, d.id);
      return { ...item, strokes } as ExportDrawingItem;
    })
  );

  return {
    snapshotItems,
    snapshotLayers: layersSnap.docs.map(
      (d) => ({ ...d.data(), id: d.id }) as FirecallLayer
    ),
  };
}

export async function exportFirecall(
  firecallId: string,
  onWarning?: BackupWarningHandler
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
  const crew = (
    await getDocs(query(collection(firecallDoc, FIRECALL_CREW_COLLECTION_ID)))
  ).docs.map((d) => ({ ...d.data(), id: d.id }) as CrewAssignment);

  // Export items with attachments and drawing strokes
  const exportItems = await Promise.all(
    items.map(async (item) => {
      if (item.type === 'marker') {
        const m = item as FcMarker;
        if (m.attachments) {
          m.attachments = await settleReporting<FcAttachment>(
            m.attachments.map((attachment) => ({
              label: attachmentLabel(attachment),
              run: () => downloadAttachmentBase64(attachment),
            })),
            'attachmentDownloadFailed',
            onWarning
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
    firecallAttachments = await settleReporting<ExportFirecallAttachment>(
      firecall.attachments.map((url) => ({
        label: url,
        run: () => downloadFirecallAttachment(url),
      })),
      'attachmentDownloadFailed',
      onWarning
    );
  }

  return {
    ...firecall,
    backupVersion: BACKUP_VERSION,
    items: exportItems,
    chat,
    layers,
    history: exportHistory,
    locations,
    kostenersatz,
    auditlog,
    crew,
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

type ImportOperation = {
  ref: ReturnType<typeof doc>;
  data: Record<string, unknown>;
};

/**
 * `commitInBatches` gegen die Client-Instanz — spart das `firestore`-Argument
 * an den vielen Aufrufstellen unten.
 */
function commitOps(operations: ImportOperation[]) {
  return commitInBatches(firestore, operations);
}

/**
 * Schreiboperationen für die Striche aller Zeichnungen in `items`.
 *
 * `parentDoc` ist der Einsatz oder ein History-Eintrag — unter beiden liegt
 * dieselbe Struktur `item/{id}/stroke`.
 */
function strokeImportOps(
  parentDoc: ReturnType<typeof doc>,
  items: (FirecallItem | ExportDrawingItem)[]
): ImportOperation[] {
  return items.flatMap((item) => {
    const drawing = item as ExportDrawingItem;
    if (item.type !== 'drawing' || !drawing.strokes?.length || !drawing.id) {
      return [];
    }
    const strokeCol = collection(
      parentDoc,
      FIRECALL_ITEMS_COLLECTION_ID,
      drawing.id,
      'stroke'
    );
    return drawing.strokes.map((stroke) => {
      const { id: _id, ...strokeData } = stroke as DrawingStroke & {
        id?: string;
      };
      return {
        ref: doc(strokeCol),
        data: {
          ...strokeData,
          points: strokeData.points.flat(),
        } as unknown as Record<string, unknown>,
      };
    });
  });
}

/** Ein Item-Dokument ohne die Striche — die gehören in die Untersammlung. */
function itemWithoutStrokes(
  item: FirecallItem | ExportDrawingItem
): Record<string, unknown> {
  const { strokes: _strokes, ...itemData } = item as ExportDrawingItem;
  return itemData as unknown as Record<string, unknown>;
}

export interface ImportFirecallOptions {
  /** Zielgruppe. Ohne Angabe bleibt die Gruppe aus der Datei stehen. */
  group?: string;
  onWarning?: BackupWarningHandler;
}

export async function importFirecall(
  firecall: FirecallExport,
  options: ImportFirecallOptions = {}
) {
  const { group, onWarning } = options;
  const {
    items,
    chat,
    layers,
    history,
    locations,
    kostenersatz,
    auditlog,
    crew,
    firecallAttachments,
    id,
    backupVersion,
    // Die Kopie hat keine eigenen Fahrtenbuch-Einträge. Bliebe der Zähler
    // stehen, meldete die Einsatz-Übersicht erfasste Fahrten, die es nicht
    // gibt — und niemand trägt sie mehr ein. `fahrtenbuchRoute` bleibt: der
    // Weg zum Einsatzort ist derselbe.
    fahrtenbuchEntryCount,
    // Die alten URLs zeigen auf die Dateien des Quell-Einsatzes. Was die Kopie
    // wirklich hat, steht erst nach dem Wiederhochladen fest.
    attachments,
    ...rest
  } = firecall;

  if ((backupVersion ?? 1) > BACKUP_VERSION) {
    onWarning?.({ code: 'newerBackupVersion', detail: `${backupVersion}` });
  }

  const firecallData = {
    ...rest,
    ...(firecallAttachments
      ? { attachments: [] }
      : attachments
        ? { attachments }
        : {}),
    ...(group ? { group } : {}),
  };

  const firecallDoc = await addDoc(
    collection(firestore, FIRECALL_COLLECTION_ID),
    firecallData
  );

  // Re-upload firecall-level attachments and update the firecall document
  if (firecallAttachments?.length) {
    const newUrls = await settleReporting(
      firecallAttachments.map((a) => ({
        label: a.name,
        run: async () => {
          const blob = blobFromBase64String(a.data, a.mimeType);
          const uploadRef = await uploadFile(
            firecallDoc.id,
            storageFileName(a.name),
            blob,
            { contentType: a.mimeType }
          );
          return uploadRef.toString();
        },
      })),
      'attachmentUploadFailed',
      onWarning
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
  const crewCol = collection(firecallDoc, FIRECALL_CREW_COLLECTION_ID);

  // Upload marker attachments
  const importItems = await Promise.all(
    items.map(async (i) => {
      if (i.type === 'marker') {
        const m = i as FcMarker;
        if (m.attachments) {
          m.attachments = await settleReporting<FcItemAttachment>(
            m.attachments.map((attachment) => ({
              label: attachmentLabel(attachment),
              run: async () => {
                if (typeof attachment === 'string') {
                  return attachment;
                }
                const a = attachment as FcAttachment;
                const blob = blobFromBase64String(a.data, a.mimeType);
                const uploadRef = await uploadFile(
                  firecallDoc.id,
                  storageFileName(a.name),
                  blob,
                  { contentType: a.mimeType }
                );
                return uploadRef.toString();
              },
            })),
            'attachmentUploadFailed',
            onWarning
          );
        }
      }
      return i;
    })
  );

  // Import items (without drawing strokes in document data)
  await commitOps(
    importItems.map((item) => ({
      ref: doc(itemCol, item.id || uuid()),
      data: itemWithoutStrokes(item),
    }))
  );

  // Import drawing strokes as sub-subcollections
  await commitOps(strokeImportOps(firecallDoc, importItems));

  // Import chat
  if (chat?.length) {
    await commitOps(
      chat.map((c) => ({
        ref: doc(chatCol, c.id || uuid()),
        data: c as unknown as Record<string, unknown>,
      }))
    );
  }

  // Import layers (keep IDs, as they are referenced by items)
  if (layers?.length) {
    await commitOps(
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
    await commitOps(
      historyRefs.map(({ ref: r, data }) => ({ ref: r, data }))
    );

    // Write snapshot sub-collections
    for (const { ref: historyDocRef, entry } of historyRefs) {
      const { snapshotItems, snapshotLayers } = entry;

      if (snapshotItems?.length) {
        const snapshotItemCol = collection(
          historyDocRef,
          FIRECALL_ITEMS_COLLECTION_ID
        );
        await commitOps(
          snapshotItems.map((item) => ({
            ref: doc(snapshotItemCol, item.id || uuid()),
            data: itemWithoutStrokes(item),
          }))
        );
        // Zeichnungen im Snapshot haben ihre Striche eine Ebene tiefer.
        await commitOps(strokeImportOps(historyDocRef, snapshotItems));
      }

      if (snapshotLayers?.length) {
        await commitOps(
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
    await commitOps(
      locations.map((l) => ({
        ref: doc(locationCol, l.id || uuid()),
        data: l as unknown as Record<string, unknown>,
      }))
    );
  }

  // Import kostenersatz
  if (kostenersatz?.length) {
    await commitOps(
      kostenersatz.map((k) => ({
        ref: doc(kostenersatzCol, k.id || uuid()),
        data: k as unknown as Record<string, unknown>,
      }))
    );
  }

  // Import auditlog
  if (auditlog?.length) {
    await commitOps(
      auditlog.map((a) => ({
        ref: doc(auditlogCol, a.id || uuid()),
        data: a as unknown as Record<string, unknown>,
      }))
    );
  }

  // Import crew assignments
  if (crew?.length) {
    await commitOps(
      crew.map((c) => ({
        ref: doc(crewCol, c.id || uuid()),
        data: c as unknown as Record<string, unknown>,
      }))
    );
  }

  return firecallDoc;
}
