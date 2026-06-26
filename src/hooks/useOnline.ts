'use client';

import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getSnapshot(): boolean {
  return typeof navigator !== 'undefined' && 'onLine' in navigator
    ? navigator.onLine
    : true;
}

function getServerSnapshot(): boolean {
  // The server has no network status; assume online to match the initial
  // client render and avoid a hydration mismatch.
  return true;
}

/**
 * Tracks the browser's network connectivity using `navigator.onLine` and the
 * window `online`/`offline` events.
 *
 * Returns `true` while the device reports a network connection.
 *
 * Note: `navigator.onLine` only reflects whether the device has *any* network
 * link, not whether the backend is actually reachable. It is still a reliable
 * signal for the common "tablet has no connection" case that causes unsynced
 * Firestore writes to be lost.
 */
export default function useOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
