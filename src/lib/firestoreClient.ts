'use client';

import {
  setDoc as fsSetDoc,
  updateDoc as fsUpdateDoc,
  addDoc as fsAddDoc,
  deleteDoc as fsDeleteDoc,
  type DocumentReference,
  type CollectionReference,
  type DocumentData,
  type SetOptions,
  type UpdateData,
  type WithFieldValue,
  type PartialWithFieldValue,
  type WriteBatch,
} from 'firebase/firestore';
import { withFreshAuth } from '../hooks/auth/withFreshAuth';

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
  return withFreshAuth(() =>
    options === undefined
      ? fsSetDoc(reference as DocumentReference<unknown>, data as WithFieldValue<unknown>)
      : fsSetDoc(
          reference as DocumentReference<unknown>,
          data as PartialWithFieldValue<unknown>,
          options,
        ),
  );
}

export function updateDoc<AppModelType, DbModelType extends DocumentData>(
  reference: DocumentReference<AppModelType, DbModelType>,
  data: UpdateData<DbModelType>,
): Promise<void> {
  return withFreshAuth(() => fsUpdateDoc(reference, data));
}

export function addDoc<AppModelType, DbModelType extends DocumentData>(
  reference: CollectionReference<AppModelType, DbModelType>,
  data: WithFieldValue<AppModelType>,
): Promise<DocumentReference<AppModelType, DbModelType>> {
  return withFreshAuth(() => fsAddDoc(reference, data));
}

export function deleteDoc<
  AppModelType,
  DbModelType extends DocumentData,
>(
  reference: DocumentReference<AppModelType, DbModelType>,
): Promise<void> {
  return withFreshAuth(() => fsDeleteDoc(reference));
}

/**
 * Wrap a `writeBatch().commit()` through `withFreshAuth`. The batch itself is
 * still assembled with the SDK's synchronous `batch.set` / `batch.update` /
 * `batch.delete` calls; only the network-bound commit goes through the
 * wrapper.
 */
export function commitBatch(batch: WriteBatch): Promise<void> {
  return withFreshAuth(() => batch.commit());
}
