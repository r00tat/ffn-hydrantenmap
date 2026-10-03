'use client';

import { useEffect } from 'react';
import { trackPersistedPendingWrites } from '../lib/firestoreSync';
import { setQueueUser } from '../lib/offlineQueue';
import { startOfflineQueueWithHandlers } from '../lib/offlineQueueHandlers';
import useFirebaseLogin from './useFirebaseLogin';

/**
 * Startet die Warteschlange für nachzuholende Server Actions und Uploads
 * (`src/lib/offlineQueue.ts`) und hält sie auf dem Stand der Anmeldung:
 * Eingereiht wird unter der UID des angemeldeten Benutzers, abgearbeitet erst,
 * wenn Firebase Auth den Benutzer kennt und die Anmeldung am Server in diesem
 * Lauf gelungen ist (`authSource === 'server'`). Hängt im
 * `ConnectivityProvider`.
 */
export default function useOfflineQueue(): void {
  const { uid, hasFirebaseUser, authSource } = useFirebaseLogin();

  useEffect(() => startOfflineQueueWithHandlers(), []);

  useEffect(() => {
    setQueueUser(uid ?? null, hasFirebaseUser && authSource === 'server');
  }, [uid, hasFirebaseUser, authSource]);

  const firebaseUid = hasFirebaseUser ? uid : undefined;
  useEffect(() => {
    if (firebaseUid) trackPersistedPendingWrites();
  }, [firebaseUid]);
}
