'use client';

/**
 * Tracks the number of in-flight Firestore writes.
 *
 * With offline persistence enabled, the promise returned by a Firestore write
 * resolves only once the backend has acknowledged it. While the device is
 * offline the write is applied to the local cache immediately but its promise
 * stays pending until the connection is restored and the write is synced.
 *
 * By counting these pending promises we can tell whether there are unsynced
 * changes — which is what lets the UI show a "changes synced" confirmation once
 * the device comes back online.
 */

type Listener = (count: number) => void;

let pendingCount = 0;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) {
    listener(pendingCount);
  }
}

export function getPendingWriteCount(): number {
  return pendingCount;
}

export function subscribePendingWrites(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Track a Firestore write promise. Increments the pending counter immediately
 * and decrements it once the promise settles (resolved or rejected). Returns
 * the same promise so it can be awaited transparently by the caller.
 */
export function trackPendingWrite<T>(promise: Promise<T>): Promise<T> {
  pendingCount += 1;
  notify();

  const settle = () => {
    pendingCount = Math.max(0, pendingCount - 1);
    notify();
  };
  promise.then(settle, settle);

  return promise;
}
