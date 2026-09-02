import 'server-only';

import { getMessaging } from 'firebase-admin/messaging';
import {
  ATEMSCHUTZ_TRUPP_COLLECTION_ID,
  warnungVermerk,
  type AtemschutzTrupp,
  type WarnungKey,
} from '../../common/atemschutz';
import {
  dringlichsteWarnung,
  offeneWarnungen,
  berechneStand,
} from '../../common/atemschutzUeberwachung';
import { firestore } from '../../server/firebase/admin';
import type { Firecall } from '../firebase/firestore';
import {
  FIRECALL_COLLECTION_ID,
  USER_COLLECTION_ID,
} from '../firebase/firestore';
import {
  buildUeberwachungPush,
  type PushTranslate,
} from './ueberwachungPushModel';

/**
 * Der Zeitplan-Lauf der Atemschutzüberwachung.
 *
 * **Warum serverseitig und nicht im Browser:** Die Drittel-Regel und der
 * Rückzugszeitpunkt sind Vorschrift („hat die mit der Atemschutzüberwachung
 * betraute Person die Flaschendrücke abzufragen"), und ein Gruppenkommandant
 * hat das Telefon in der Tasche, nicht die Seite offen. Eine Warnung, die nur
 * kommt, solange jemand hinsieht, ist für eine Sicherheitsfunktion keine.
 * Clientseitig zeigt die Karte die Warnung zusätzlich an — das ersetzt den Push
 * nicht, sondern kommt ihm nur zuvor.
 *
 * Getrennt vom Route Handler, damit Reihenfolge und Fehlerverhalten ohne HTTP
 * prüfbar sind — dieselbe Aufteilung wie bei `sendWeeklyReports`.
 */

export type WarnungStatus = 'sent' | 'noRecipient' | 'failed' | 'dryRun';

export interface WarnungResult {
  firecallId: string;
  truppId: string;
  warnung: WarnungKey;
  status: WarnungStatus;
  /** Zahl der Geräte, an die verschickt wurde. */
  tokenCount: number;
  /** Nur bei `dryRun` — zum Prüfen ohne Versand. */
  title?: string;
  body?: string;
  error?: string;
}

export interface SendUeberwachungWarnungenOptions {
  /** Ohne Angabe der Jetzt-Zeitpunkt. Für Tests und einen Nachlauf von Hand. */
  jetzt?: Date;
  dryRun?: boolean;
  t: PushTranslate;
  /** Formatiert einen ISO-Zeitstempel als Uhrzeit der Zielzeitzone. */
  uhrzeit: (iso: string) => string;
}

export interface SendUeberwachungWarnungenResult {
  /** Trupps mit Status `imEinsatz`, die geprüft wurden. */
  geprueft: number;
  results: WarnungResult[];
}

/**
 * Die Push-Token der Geräte, die an dieser Überwachung arbeiten.
 *
 * Empfänger sind die `uid`s aus `ueberwachungUids` — wer übernommen oder eine
 * Druckabfrage erfasst hat. Bewusst **nicht** alle Gruppenmitglieder: Eine
 * Warnung, die jede Feuerwehrfrau und jeden Feuerwehrmann erreicht, ist nach
 * dem zweiten Einsatz eine, die niemand mehr ansieht.
 */
async function tokensFor(uids: string[]): Promise<string[]> {
  const eindeutig = [...new Set(uids.filter((uid) => !!uid?.trim()))];
  if (eindeutig.length === 0) return [];
  const docs = await firestore.getAll(
    ...eindeutig.map((uid) =>
      firestore.collection(USER_COLLECTION_ID).doc(uid),
    ),
  );
  const tokens = new Set<string>();
  for (const snap of docs) {
    const messaging = snap.data()?.messaging;
    if (!Array.isArray(messaging)) continue;
    for (const token of messaging) {
      if (typeof token === 'string' && token.trim()) tokens.add(token);
    }
  }
  return [...tokens];
}

export async function sendUeberwachungWarnungen({
  jetzt = new Date(),
  dryRun = false,
  t,
  uhrzeit,
}: SendUeberwachungWarnungenOptions): Promise<SendUeberwachungWarnungenResult> {
  // Collection-Group-Abfrage über alle Einsätze. Ein einzelnes Feld, deshalb
  // genügt der automatische Index — ein `orderBy` käme nicht ohne
  // zusammengesetzten Index aus und brächte hier nichts: Sortiert wird nichts,
  // gefiltert wird auf einen Zustand, den nur wenige Dokumente tragen.
  const snap = await firestore
    .collectionGroup(ATEMSCHUTZ_TRUPP_COLLECTION_ID)
    .where('status', '==', 'imEinsatz')
    .get();

  const results: WarnungResult[] = [];
  // Ein Einsatz trägt mehrere Trupps; sein Name wird einmal gelesen.
  const firecalls = new Map<string, Firecall | undefined>();

  for (const doc of snap.docs) {
    const firecallRef = doc.ref.parent.parent;
    // Ein Trupp ohne Einsatz darüber kann nicht entstehen; ein Import von Hand
    // kann es. Ohne Einsatz gibt es keinen Link und keinen Namen.
    if (!firecallRef) continue;
    const firecallId = firecallRef.id;
    const trupp = { ...(doc.data() as AtemschutzTrupp), id: doc.id };

    if (!firecalls.has(firecallId)) {
      const fcSnap = await firestore
        .collection(FIRECALL_COLLECTION_ID)
        .doc(firecallId)
        .get();
      firecalls.set(
        firecallId,
        fcSnap.exists ? (fcSnap.data() as Firecall) : undefined,
      );
    }
    const firecall = firecalls.get(firecallId);
    // Ein gelöschter Einsatz wird nicht mehr überwacht. Dass ein Trupp darin
    // noch auf `imEinsatz` steht, heißt nur, dass niemand ihn eingerückt hat.
    if (!firecall || firecall.deleted === true) continue;

    const offen = offeneWarnungen(trupp, jetzt);
    if (offen.length === 0) continue;

    const warnung = dringlichsteWarnung(offen);
    const stand = berechneStand(trupp, jetzt);
    if (!warnung || !stand) continue;

    const tokens = await tokensFor(trupp.ueberwachungUids ?? []);
    const push = buildUeberwachungPush({
      firecallId,
      firecallName: firecall.name,
      trupp,
      stand,
      warnung,
      t,
      uhrzeit,
    });

    const basis = {
      firecallId,
      truppId: doc.id,
      warnung: warnung.key,
      tokenCount: tokens.length,
    };

    if (tokens.length === 0) {
      // **Nicht** vermerken: Ein Gerät, das sich später registriert, soll die
      // Warnung noch bekommen. Der Lauf kommt jede Minute wieder, und ohne
      // Empfänger kostet der Wiederholungsversuch nichts.
      results.push({ ...basis, status: 'noRecipient' });
      continue;
    }

    if (dryRun) {
      results.push({
        ...basis,
        status: 'dryRun',
        title: push.title,
        body: push.body,
      });
      continue;
    }

    try {
      await getMessaging().sendEachForMulticast({
        tokens,
        data: push.data as unknown as Record<string, string>,
      });
      // Alle offenen Warnungen vermerken, nicht nur die verschickte: Die
      // überholten Erinnerungen sind mit der dringlicheren Meldung erledigt,
      // und nachträglich zugestellt wären sie irreführend.
      const vermerke = offen.reduce<Record<string, string>>(
        (acc, w) => ({ ...acc, ...warnungVermerk(w.key, jetzt.toISOString()) }),
        {},
      );
      await doc.ref.update(vermerke);
      results.push({ ...basis, status: 'sent' });
    } catch (err) {
      // Ein Fehler an einem Trupp darf den Lauf nicht beenden — die anderen
      // Warnungen sind davon unabhängig.
      console.error(
        `Atemschutzwarnung fehlgeschlagen (${firecallId}/${doc.id})`,
        err,
      );
      results.push({
        ...basis,
        status: 'failed',
        error: (err as Error).message,
      });
    }
  }

  return { geprueft: snap.size, results };
}
