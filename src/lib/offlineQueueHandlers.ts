'use client';

import { arrayUnion, doc } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable } from 'firebase/storage';
import app, { firestore } from '../components/firebase/firebase';
// Registriert beim Import den Handler der Terminplanung der Atemschutzwarnung.
import '../components/Atemschutz/ueberwachungWarnungQueue';
// Registriert den Handler des Materialverbrauchs im Einsatz (Abbuchen vom Lager).
import '../components/Geraete/geraetVerbrauchQueue';
// Registriert den Handler des Protokolls der Gerätezuordnung im Einsatz.
import '../components/Geraete/geraetZuordnungQueue';
import { ensureFreshAuth } from '../hooks/auth/ensureFreshAuth';
import { updateDocLocal } from './firestoreClient';
import { waitForFirestoreSync } from './firestoreSync';
import { setQueuePreparation, startOfflineQueue } from './offlineQueue';
import { createUploadHandler, registerUploadHandler } from './uploadQueue';
import { withTimeout } from './withTimeout';

/** Höchstwartezeit, bis Token und Sitzung vor einem Durchlauf aufgefrischt sind. */
export const QUEUE_AUTH_TIMEOUT_MS = 15_000;

/**
 * Registriert die Handler der Warteschlange app-weit und startet sie.
 *
 * App-weit, nicht in der Seite, die eingereiht hat: Wer offline einen Anhang
 * anfügt und dann zur Karte wechselt, soll den Upload beim Reconnect trotzdem
 * bekommen — und nach einem Neustart erst recht.
 */
let registered = false;

/**
 * Vor jedem Durchlauf: Erst müssen die offline geschriebenen
 * Firestore-Änderungen beim Server sein — die nachgeholte Terminplanung liest
 * den Trupp per Admin SDK und sähe sonst den alten Stand oder gar keinen. Dann
 * Token und NextAuth-Sitzung auffrischen; nach langer Funkstille sind beide
 * abgelaufen, und jeder Eintrag scheiterte an der Anmeldung.
 */
export async function prepareQueueRun(): Promise<boolean> {
  await waitForFirestoreSync();
  return withTimeout(
    ensureFreshAuth(),
    QUEUE_AUTH_TIMEOUT_MS,
    'ensureFreshAuth',
  ).catch(() => false);
}

function registerHandlers(): void {
  if (registered) return;
  registered = true;
  const storage = getStorage(app);
  setQueuePreparation(prepareQueueRun);
  registerUploadHandler(
    createUploadHandler({
      async upload(storagePath, blob, contentType) {
        const fileRef = ref(storage, storagePath);
        const result = await uploadBytesResumable(
          fileRef,
          blob,
          contentType ? { contentType } : undefined,
        );
        return result.ref.toString();
      },
      attach(target, reference) {
        // `update` und nicht `set` mit merge: Ist das Dokument inzwischen
        // gelöscht, soll kein Rumpfdokument mit nur dem Anhang entstehen.
        // Die Ablehnung landet in der Fehlerliste.
        updateDocLocal(doc(firestore, target.docPath), {
          [target.field]: arrayUnion(reference),
        });
      },
    }),
  );
}

export function startOfflineQueueWithHandlers(): () => void {
  registerHandlers();
  return startOfflineQueue();
}
