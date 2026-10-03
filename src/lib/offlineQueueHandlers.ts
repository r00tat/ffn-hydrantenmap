'use client';

import { arrayUnion, doc } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable } from 'firebase/storage';
import app, { firestore } from '../components/firebase/firebase';
// Registriert beim Import den Handler der Terminplanung der Atemschutzwarnung.
import '../components/Atemschutz/ueberwachungWarnungQueue';
import { updateDocLocal } from './firestoreClient';
import { startOfflineQueue } from './offlineQueue';
import { createUploadHandler, registerUploadHandler } from './uploadQueue';

/**
 * Registriert die Handler der Warteschlange app-weit und startet sie.
 *
 * App-weit, nicht in der Seite, die eingereiht hat: Wer offline einen Anhang
 * anfügt und dann zur Karte wechselt, soll den Upload beim Reconnect trotzdem
 * bekommen — und nach einem Neustart erst recht.
 */
let registered = false;

function registerHandlers(): void {
  if (registered) return;
  registered = true;
  const storage = getStorage(app);
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
