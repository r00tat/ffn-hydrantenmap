'use client';

import {
  setDoc as fsSetDoc,
  updateDoc as fsUpdateDoc,
  addDoc as fsAddDoc,
  deleteDoc as fsDeleteDoc,
  doc,
  writeBatch,
  type DocumentReference,
  type CollectionReference,
  type DocumentData,
  type Firestore,
  type SetOptions,
  type UpdateData,
  type WithFieldValue,
  type PartialWithFieldValue,
  type WriteBatch,
} from 'firebase/firestore';
import { ensureFreshAuth, isAuthError } from '../hooks/auth/ensureFreshAuth';
import { withFreshAuth } from '../hooks/auth/withFreshAuth';
import { isOffline } from './connectivity';
import { trackPendingWrite } from './pendingWrites';
import { recordSyncError, type SyncWriteKind } from './syncErrors';

/**
 * Central Firestore write client. All mutation calls are routed through
 * `withFreshAuth` so that an expired session (e.g. after device standby) is
 * transparently refreshed and the write is retried once on an auth error.
 *
 * Use this module instead of importing `setDoc` / `updateDoc` / `addDoc` /
 * `deleteDoc` directly from `firebase/firestore`.
 *
 * For batched writes: build the batch with `writeBatch(firestore)` from the
 * SDK as usual, but commit it via `commitBatch(batch)` from this module so the
 * commit goes through the auth wrapper.
 *
 * For composite read-modify-write operations, wrap the whole block manually
 * with `withFreshAuth(() => { ... })`.
 *
 * **Lokal schreiben:** `setDoc` & Co. kehren erst mit der Bestätigung des
 * Servers zurück — offline also nie. Wer nicht auf den Server warten muss
 * (Dialoge, Eingaben), nimmt `addDocLocal` / `setDocLocal` / `updateDocLocal` /
 * `deleteDocLocal` / `commitBatchLocal`: Sie setzen den Schreibvorgang sofort
 * ab, er steht damit im lokalen Cache, und kehren gleich zurück. Siehe
 * `docs/offline-modus.md`.
 *
 * The `updateDoc` field-path overload (`updateDoc(ref, 'field', value, ...)`)
 * is intentionally not re-exported. No call site in this codebase uses it.
 * If a future caller needs it, prefer passing a partial object:
 * `updateDoc(ref, { field: value })`. Add the overload here if that becomes
 * impractical.
 */

export function setDoc<AppModelType, DbModelType extends DocumentData>(
  reference: DocumentReference<AppModelType, DbModelType>,
  data: WithFieldValue<AppModelType>,
): Promise<void>;
export function setDoc<AppModelType, DbModelType extends DocumentData>(
  reference: DocumentReference<AppModelType, DbModelType>,
  data: PartialWithFieldValue<AppModelType>,
  options: SetOptions,
): Promise<void>;
export function setDoc(
  reference: DocumentReference<unknown, DocumentData>,
  data: unknown,
  options?: SetOptions,
): Promise<void> {
  return trackPendingWrite(
    withFreshAuth(() =>
      options === undefined
        ? fsSetDoc(reference as DocumentReference<unknown>, data as WithFieldValue<unknown>)
        : fsSetDoc(
            reference as DocumentReference<unknown>,
            data as PartialWithFieldValue<unknown>,
            options,
          ),
    ),
  );
}

export function updateDoc<AppModelType, DbModelType extends DocumentData>(
  reference: DocumentReference<AppModelType, DbModelType>,
  data: UpdateData<DbModelType>,
): Promise<void> {
  return trackPendingWrite(withFreshAuth(() => fsUpdateDoc(reference, data)));
}

export function addDoc<AppModelType, DbModelType extends DocumentData>(
  reference: CollectionReference<AppModelType, DbModelType>,
  data: WithFieldValue<AppModelType>,
): Promise<DocumentReference<AppModelType, DbModelType>> {
  return trackPendingWrite(withFreshAuth(() => fsAddDoc(reference, data)));
}

export function deleteDoc<
  AppModelType,
  DbModelType extends DocumentData,
>(
  reference: DocumentReference<AppModelType, DbModelType>,
): Promise<void> {
  return trackPendingWrite(withFreshAuth(() => fsDeleteDoc(reference)));
}

/**
 * Wrap a `writeBatch().commit()` through `withFreshAuth`. The batch itself is
 * still assembled with the SDK's synchronous `batch.set` / `batch.update` /
 * `batch.delete` calls; only the network-bound commit goes through the
 * wrapper.
 */
export function commitBatch(batch: WriteBatch): Promise<void> {
  return trackPendingWrite(withFreshAuth(() => batch.commit()));
}

/**
 * Ein `writeBatch` fasst höchstens 500 Schreibvorgänge. Wer mehr zu schreiben
 * hat — ein Import, ein History-Snapshot eines großen Einsatzes — teilt sie
 * hiermit auf.
 *
 * Jede Teilmenge geht durch `commitBatch`, also durch `withFreshAuth`:
 * Scheitert ein Commit an einem abgelaufenen Token, wird nur dieser Teil
 * wiederholt, die bereits geschriebenen bleiben stehen.
 */
export async function commitInBatches(
  firestore: Firestore,
  operations: {
    ref: DocumentReference;
    data: DocumentData;
  }[],
): Promise<void> {
  const BATCH_LIMIT = 499;
  for (let i = 0; i < operations.length; i += BATCH_LIMIT) {
    const batch = writeBatch(firestore);
    for (const { ref, data } of operations.slice(i, i + BATCH_LIMIT)) {
      batch.set(ref, data);
    }
    await commitBatch(batch);
  }
}

// --- Lokale Schreibvorgänge -------------------------------------------------

/**
 * Setzt einen Schreibvorgang ab, ohne auf den Server zu warten.
 *
 * `op` wird **synchron** aufgerufen: Das SDK reiht den Schreibvorgang damit
 * sofort in seine Warteschlange und den lokalen Cache ein — auch offline und
 * auch über ein Neuladen hinweg. Bewusst *nicht* über `withFreshAuth`: Das
 * wartet vorher auf `ensureFreshAuth`, und ein ablaufendes Token heißt dort
 * `getIdToken(true)` und eine Server Action, offline also Warten aufs Netz.
 * Bis dahin stünde der Schreibvorgang nicht einmal im Cache.
 *
 * Firestore holt sich sein Token selbst. Erst wenn der Server mit einem
 * Auth-Fehler ablehnt und das Gerät online ist, wird die Anmeldung erneuert
 * und der Schreibvorgang genau einmal wiederholt. Jede verbleibende Ablehnung
 * landet in `syncErrors.ts` — mit einer Wiederholung, die denselben Vorgang
 * erneut absetzt.
 *
 * Fehler bei der Prüfung der Daten (z. B. ein `undefined`-Feld) wirft das SDK
 * synchron; sie kommen beim Aufrufer an.
 */
function startLocalWrite(
  kind: SyncWriteKind,
  path: string,
  op: () => Promise<unknown>,
  repeatable = true,
): void {
  const first = op();
  const confirmed = (async () => {
    try {
      await first;
    } catch (err) {
      if (!repeatable || !isAuthError(err) || isOffline()) throw err;
      const refreshed = await ensureFreshAuth(true);
      if (!refreshed) throw err;
      await op();
    }
  })();
  trackPendingWrite(confirmed).catch((error: unknown) => {
    recordSyncError({
      kind,
      path,
      error,
      retry: repeatable ? () => startLocalWrite(kind, path, op) : undefined,
    });
  });
}

function refPath(reference: { path?: string } | undefined): string {
  return reference?.path ?? '?';
}

/**
 * Legt ein Dokument an und gibt die auf dem Gerät erzeugte Referenz sofort
 * zurück — ohne auf die Bestätigung des Servers zu warten.
 */
export function addDocLocal<AppModelType, DbModelType extends DocumentData>(
  reference: CollectionReference<AppModelType, DbModelType>,
  data: WithFieldValue<AppModelType>,
): DocumentReference<AppModelType, DbModelType> {
  const ref = doc(reference);
  startLocalWrite('add', refPath(ref), () => fsSetDoc(ref, data));
  return ref;
}

export function setDocLocal<AppModelType, DbModelType extends DocumentData>(
  reference: DocumentReference<AppModelType, DbModelType>,
  data: WithFieldValue<AppModelType>,
): void;
export function setDocLocal<AppModelType, DbModelType extends DocumentData>(
  reference: DocumentReference<AppModelType, DbModelType>,
  data: PartialWithFieldValue<AppModelType>,
  options: SetOptions,
): void;
export function setDocLocal(
  reference: DocumentReference<unknown, DocumentData>,
  data: unknown,
  options?: SetOptions,
): void {
  startLocalWrite('set', refPath(reference), () =>
    options === undefined
      ? fsSetDoc(reference as DocumentReference<unknown>, data as WithFieldValue<unknown>)
      : fsSetDoc(
          reference as DocumentReference<unknown>,
          data as PartialWithFieldValue<unknown>,
          options,
        ),
  );
}

export function updateDocLocal<AppModelType, DbModelType extends DocumentData>(
  reference: DocumentReference<AppModelType, DbModelType>,
  data: UpdateData<DbModelType>,
): void {
  startLocalWrite('update', refPath(reference), () => fsUpdateDoc(reference, data));
}

export function deleteDocLocal<AppModelType, DbModelType extends DocumentData>(
  reference: DocumentReference<AppModelType, DbModelType>,
): void {
  startLocalWrite('delete', refPath(reference), () => fsDeleteDoc(reference));
}

/**
 * Committet einen Batch lokal. Ein `WriteBatch` lässt sich nur einmal
 * committen — deshalb gibt es hier weder die Wiederholung nach einem
 * Auth-Fehler noch „Erneut versuchen" in der Fehlerliste. `description`
 * erscheint dort anstelle eines Pfads.
 */
export function commitBatchLocal(batch: WriteBatch, description = 'batch'): void {
  startLocalWrite('batch', description, () => batch.commit(), false);
}

/**
 * Wie `commitInBatches`, aber lokal: Jede Teilmenge geht durch
 * `commitBatchLocal`, der Aufruf kehrt sofort zurück.
 */
export function commitInBatchesLocal(
  firestore: Firestore,
  operations: {
    ref: DocumentReference;
    data: DocumentData;
  }[],
  description = 'batch',
): void {
  const BATCH_LIMIT = 499;
  for (let i = 0; i < operations.length; i += BATCH_LIMIT) {
    const batch = writeBatch(firestore);
    for (const { ref, data } of operations.slice(i, i + BATCH_LIMIT)) {
      batch.set(ref, data);
    }
    commitBatchLocal(batch, description);
  }
}
