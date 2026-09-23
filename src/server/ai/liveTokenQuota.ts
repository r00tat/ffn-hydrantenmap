import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { firestore } from '../firebase/admin';

/**
 * Tageskontingent für Live-Sitzungen je Benutzer.
 *
 * Warum es das braucht: Das kurzlebige Token nimmt dem Browser den API-Key ab,
 * aber es macht das Prägen selbst zur bezahlten Handlung — wer angemeldet ist,
 * kann die Server Action in einer Schleife aufrufen und damit beliebig viele
 * Sitzungen eröffnen. Weder App Check noch die Key-Freigabe hätten das je
 * verhindert; diese Schranke ist die einzige.
 *
 * Die Grenze ist bewusst hoch: Sie soll ein Skript bremsen, nicht einen
 * gesprächigen Einsatzleiter. Ein Einsatz mit 200 Sprachbefehlen je Person ist
 * keiner, der an der KI scheitern sollte.
 */
export const LIVE_TOKEN_DAILY_LIMIT = 200;

export const LIVE_TOKEN_QUOTA_COLLECTION = 'aiLiveQuota';

/**
 * Ein Dokument je Benutzer und Tag. Der Tag steckt im Schlüssel statt in einem
 * Feld, damit das Zurücksetzen nichts kostet — das Dokument von gestern wird
 * einfach nicht mehr gelesen.
 */
export function quotaDocId(uid: string, now: Date = new Date()): string {
  return `${uid}_${now.toISOString().slice(0, 10)}`;
}

/**
 * Zählt einen Aufruf und sagt, ob er noch im Kontingent liegt.
 *
 * Läuft in einer Transaktion, weil zwei Cloud-Run-Instanzen denselben Benutzer
 * gleichzeitig bedienen können. Schlägt Firestore fehl, wird der Aufruf
 * durchgelassen: Ein Sprachbefehl im Einsatz darf nicht an der Buchhaltung
 * scheitern.
 */
export async function consumeLiveTokenQuota(uid: string): Promise<boolean> {
  const ref = firestore.collection(LIVE_TOKEN_QUOTA_COLLECTION).doc(quotaDocId(uid));
  try {
    return await firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const used = (snapshot.data()?.count as number | undefined) ?? 0;
      if (used >= LIVE_TOKEN_DAILY_LIMIT) {
        return false;
      }
      transaction.set(
        ref,
        { count: FieldValue.increment(1), uid, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      return true;
    });
  } catch (error) {
    console.error('[AI] Kontingent der Live-Sitzungen nicht prüfbar:', error);
    return true;
  }
}
