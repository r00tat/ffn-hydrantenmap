'use client';

import { useMemo, useSyncExternalStore } from 'react';
import {
  enqueue,
  getQueueSnapshot,
  registerQueueHandler,
  subscribeQueue,
  type QueueEntry,
  type QueueHandler,
} from './offlineQueue';

/**
 * Upload-Warteschlange für Dateien in den Firebase Storage.
 *
 * Offline lässt sich nichts hochladen. Die Datei wandert deshalb samt Ziel in
 * die Warteschlange (`offlineQueue.ts`, IndexedDB speichert den Blob direkt)
 * und wird beim Reconnect hochgeladen. **Erst danach** schreibt der Handler die
 * Referenz (`gs://…`) ins Zieldokument — vorher gäbe es dort einen Verweis auf
 * eine Datei, die es noch nicht gibt, und jedes Gerät zeigte ein kaputtes
 * Bild. Bis dahin zeigt die Oberfläche einen Platzhalter „wartet auf Upload"
 * (`usePendingUploads`).
 *
 * Der Speicherpfad trägt schon die UUID (`storageFileName`) und dient als
 * Schlüssel: Ein doppeltes Abarbeiten lädt dieselbe Datei an denselben Ort,
 * und `arrayUnion` fügt die Referenz nur einmal ein.
 */

export const UPLOAD_QUEUE_TYPE = 'storageUpload';

export interface UploadTarget {
  /** Firestore-Dokumentpfad, z. B. `call/<id>` oder `call/<id>/item/<id>`. */
  docPath: string;
  /** Array-Feld, in das die Referenz kommt, z. B. `attachments`. */
  field: string;
}

export interface QueuedUploadPayload {
  storagePath: string;
  blob: Blob;
  contentType?: string;
  fileName: string;
  target?: UploadTarget;
}

export interface PendingUpload {
  id: string;
  fileName: string;
  storagePath: string;
}

export function queueUpload(
  payload: QueuedUploadPayload,
): Promise<QueueEntry<QueuedUploadPayload>> {
  return enqueue(UPLOAD_QUEUE_TYPE, payload, {
    key: payload.storagePath,
    label: payload.fileName,
    kind: 'upload',
  });
}

export interface UploadHandlerDeps {
  /** Lädt hoch und liefert die Referenz als `gs://`-String. */
  upload: (
    storagePath: string,
    blob: Blob,
    contentType?: string,
  ) => Promise<string>;
  /** Trägt die Referenz ins Zieldokument ein. */
  attach: (target: UploadTarget, reference: string) => void;
}

export function createUploadHandler(
  deps: UploadHandlerDeps,
): QueueHandler<QueuedUploadPayload> {
  return async ({ storagePath, blob, contentType, target }) => {
    const reference = await deps.upload(storagePath, blob, contentType);
    if (target) deps.attach(target, reference);
  };
}

export function registerUploadHandler(
  handler: QueueHandler<QueuedUploadPayload>,
): () => void {
  return registerQueueHandler(UPLOAD_QUEUE_TYPE, handler);
}

export function filterPendingUploads(
  entries: readonly QueueEntry[],
  target: UploadTarget,
): PendingUpload[] {
  return entries
    .filter((e) => e.type === UPLOAD_QUEUE_TYPE)
    .map((e) => ({ id: e.id, payload: e.payload as QueuedUploadPayload }))
    .filter(
      ({ payload }) =>
        payload.target?.docPath === target.docPath &&
        payload.target?.field === target.field,
    )
    .map(({ id, payload }) => ({
      id,
      fileName: payload.fileName,
      storagePath: payload.storagePath,
    }));
}

const EMPTY: readonly QueueEntry[] = [];

/** Die noch wartenden Uploads für ein Zieldokument und -feld. */
export function usePendingUploads(target?: UploadTarget): PendingUpload[] {
  const entries = useSyncExternalStore(
    subscribeQueue,
    getQueueSnapshot,
    () => EMPTY,
  );
  const docPath = target?.docPath;
  const field = target?.field;
  return useMemo(
    () =>
      docPath && field
        ? filterPendingUploads(entries, { docPath, field })
        : [],
    [entries, docPath, field],
  );
}
