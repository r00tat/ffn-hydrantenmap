'use client';

import { disableNetwork, enableNetwork } from 'firebase/firestore';
import { firestore } from '../components/firebase/firebase';
import { ensureFreshAuth } from '../hooks/auth/ensureFreshAuth';
import { checkConnectivityNow } from './connectivity';
import { processQueue } from './offlineQueue';
import { withTimeout } from './withTimeout';

/** Höchstdauer für das Ab- und Wiederanschalten des Firestore-Netzes. */
const FIRESTORE_RESTART_TIMEOUT_MS = 10_000;

export interface SyncRetryDeps {
  checkConnectivity: () => Promise<boolean>;
  refreshAuth: () => Promise<boolean>;
  restartFirestore: () => Promise<void>;
  processQueue: () => Promise<void>;
}

async function restartFirestoreNetwork(): Promise<void> {
  // Schließt die Streams und baut sie neu auf. Firestore holt dabei Auth- und
  // App-Check-Token frisch und überspringt seinen Backoff. Wartende
  // Schreibvorgänge bleiben in der Warteschlange des SDK.
  await withTimeout(
    disableNetwork(firestore),
    FIRESTORE_RESTART_TIMEOUT_MS,
    'disableNetwork',
  ).catch((err) => console.warn('sync retry: disableNetwork failed', err));
  await withTimeout(
    enableNetwork(firestore),
    FIRESTORE_RESTART_TIMEOUT_MS,
    'enableNetwork',
  );
}

const defaultDeps: SyncRetryDeps = {
  checkConnectivity: checkConnectivityNow,
  refreshAuth: () => ensureFreshAuth(true),
  restartFirestore: restartFirestoreNetwork,
  processQueue,
};

let inflight: Promise<'offline' | 'retried'> | null = null;

async function run(deps: SyncRetryDeps): Promise<'offline' | 'retried'> {
  if (!(await deps.checkConnectivity())) return 'offline';

  // Erst die Anmeldung, damit Firestore beim Neuaufbau ein frisches Token
  // bekommt. Scheitert sie, wird trotzdem neu verbunden: Firestore holt sich
  // sein Token auch selbst.
  try {
    if (!(await deps.refreshAuth())) {
      console.warn('sync retry: login refresh failed');
    }
  } catch (err) {
    console.warn('sync retry: login refresh failed', err);
  }

  try {
    await deps.restartFirestore();
  } catch (err) {
    console.warn('sync retry: firestore restart failed', err);
  }

  try {
    await deps.processQueue();
  } catch (err) {
    console.warn('sync retry: queue processing failed', err);
  }
  return 'retried';
}

/**
 * Vom Benutzer angestoßener Synchronisationsversuch (Antippen des Status-Chips):
 * Server anpingen, Anmeldung erneuern, Firestore neu verbinden und die
 * Warteschlange der Server Actions und Uploads abarbeiten.
 *
 * Liefert `offline`, wenn der Server nicht erreichbar ist. Ein Doppeltippen
 * startet keinen zweiten Durchlauf.
 */
export function retrySyncNow(
  deps: SyncRetryDeps = defaultDeps,
): Promise<'offline' | 'retried'> {
  if (inflight) return inflight;
  inflight = run(deps).finally(() => {
    inflight = null;
  });
  return inflight;
}
