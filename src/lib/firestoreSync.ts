'use client';

import { waitForPendingWrites } from 'firebase/firestore';
import { firestore } from '../components/firebase/firebase';
import { trackPendingWrite } from './pendingWrites';
import { withTimeout } from './withTimeout';

/** So lange wird höchstens auf die Übertragung offener Schreibvorgänge gewartet. */
export const FIRESTORE_SYNC_TIMEOUT_MS = 15_000;

/**
 * Wartet, bis Firestore die offline geschriebenen Änderungen übertragen hat —
 * mit Zeitgrenze.
 *
 * Nach einem Reconnect meldet der Ping „erreichbar", bevor Firestore sich mit
 * eigenem Backoff neu verbunden hat. Eine Server Action, die den Stand per
 * Admin SDK liest (etwa die Terminplanung der Atemschutzwarnung), sähe sonst
 * noch den alten oder gar keinen Datensatz. Liefert `false`, wenn die Zeit
 * abläuft oder das Warten scheitert; der Aufrufer macht dann trotzdem weiter.
 */
export async function waitForFirestoreSync(
  timeoutMs = FIRESTORE_SYNC_TIMEOUT_MS,
): Promise<boolean> {
  try {
    await withTimeout(
      waitForPendingWrites(firestore),
      timeoutMs,
      'waitForPendingWrites',
    );
    return true;
  } catch (err) {
    console.warn('firestore sync: pending writes not confirmed', err);
    return false;
  }
}

/**
 * Zählt die Schreibvorgänge mit, die `persistentLocalCache` aus einem früheren
 * Lauf noch hält. Der Zähler in `pendingWrites.ts` lebt nur im Speicher und
 * stünde nach einem Neuladen auf 0 — der Chip zeigte dann kein `syncing`, und
 * beim Reconnect käme keine Bestätigung. Das SDK nennt keine Anzahl; gezählt
 * wird deshalb ein einziger Platzhalter, bis alles übertragen ist.
 *
 * Erst aufrufen, wenn Firebase Auth den Benutzer kennt: Die offenen
 * Schreibvorgänge gehören zu ihm, und ein Benutzerwechsel lässt das Warten
 * scheitern.
 */
export function trackPersistedPendingWrites(): void {
  void trackPendingWrite(waitForPendingWrites(firestore)).catch(() => {
    // Benutzer gewechselt oder abgemeldet — der Zähler fällt trotzdem zurück.
  });
}
