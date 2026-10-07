'use client';

import {
  waitForPendingWrites,
  type Firestore,
  type FirestoreError,
  type Unsubscribe,
} from 'firebase/firestore';

/**
 * Startet einen `onSnapshot`-Listener und meldet ihn nach einem
 * `permission-denied` **einmal** neu an — sobald die offenen Schreibvorgänge
 * des Geräts vom Server bestätigt sind.
 *
 * Hintergrund: Die Regeln aller Untersammlungen eines Einsatzes lesen die
 * Gruppe per `get()` am Einsatzdokument. Ein offline angelegter Einsatz
 * existiert auf dem Server aber erst, wenn sein Schreibvorgang übertragen ist.
 * Nach dem Reconnect laufen Listen- und Schreibverbindung parallel an; kommt
 * der Listener zuerst an, lehnt der Server ihn ab, und das SDK beendet ihn
 * endgültig. Die Liste bliebe auf dem Stand vor dem Reconnect stehen, bis die
 * App neu startet.
 *
 * `waitForPendingWrites` wartet offline, bis die Verbindung wieder steht. Eine
 * zweite Ablehnung ist echt und geht an `onError` — ebenso eine, wenn das
 * Warten scheitert (etwa nach einem Benutzerwechsel).
 *
 * `subscribe` erhält den Fehler-Callback, den es an `onSnapshot` weiterreicht.
 */
export function subscribeRetryingAfterPendingWrites(
  firestore: Firestore,
  subscribe: (onError: (err: FirestoreError) => void) => Unsubscribe,
  onError: (err: FirestoreError) => void,
): Unsubscribe {
  let retried = false;
  let active = true;
  let unsubscribe: Unsubscribe = () => {};

  const handleError = (err: FirestoreError) => {
    if (!active) return;
    if (retried || err.code !== 'permission-denied') {
      onError(err);
      return;
    }
    retried = true;
    console.info('listener denied, retrying after pending writes', err);
    waitForPendingWrites(firestore).then(
      () => {
        if (active) unsubscribe = subscribe(handleError);
      },
      () => {
        if (active) onError(err);
      },
    );
  };

  unsubscribe = subscribe(handleError);

  return () => {
    active = false;
    unsubscribe();
  };
}
