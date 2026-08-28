'use client';

import {
  setDoc as fsSetDoc,
  updateDoc as fsUpdateDoc,
  addDoc as fsAddDoc,
  deleteDoc as fsDeleteDoc,
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
import { withFreshAuth } from '../hooks/auth/withFreshAuth';
import { trackPendingWrite } from './pendingWrites';

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
