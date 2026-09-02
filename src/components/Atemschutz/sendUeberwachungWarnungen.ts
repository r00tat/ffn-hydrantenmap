import 'server-only';

import { getMessaging } from 'firebase-admin/messaging';
import {
  ATEMSCHUTZ_TRUPP_COLLECTION_ID,
  sanitizeUeberwachungUids,
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

export type WarnungStatus =
  | 'sent'
  /**
   * Verschickt, aber der Vermerk am Dokument ist nicht durchgekommen.
   *
   * Ein eigener Zustand und nicht `failed`: Der Unterschied entscheidet, ob die
   * Warnung beim nächsten Lauf erneut hinausgeht. Er gehört ins Ergebnis, damit
   * der Betrieb den Unterschied auch sieht.
   */
  | 'sentUnrecorded'
  | 'noRecipient'
  | 'failed'
  | 'dryRun';

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
 * Obergrenze der Token je Sendung.
 *
 * `sendEachForMulticast` nimmt höchstens 500 Token und weist mehr komplett ab —
 * eine Warnung, die an gar niemanden geht, wäre die schlechteste aller
 * Antworten. Mit `MAX_UEBERWACHUNG_UIDS` Geräten und mehreren Browsern je
 * Benutzer ist die Grenze praktisch unerreichbar; sie steht als Riegel da.
 */
const MAX_TOKENS_PRO_SENDUNG = 500;

/**
 * Die Push-Token der Geräte, die an dieser Überwachung arbeiten.
 *
 * Empfänger sind die `uid`s aus `ueberwachungUids` — wer übernommen oder eine
 * Druckabfrage erfasst hat. Bewusst **nicht** alle Gruppenmitglieder: Eine
 * Warnung, die jede Feuerwehrfrau und jeden Feuerwehrmann erreicht, ist nach
 * dem zweiten Einsatz eine, die niemand mehr ansieht.
 */
async function tokensFor(uids: string[] | undefined): Promise<string[]> {
  // `sanitizeUeberwachungUids` ist hier die Sicherheitsgrenze, nicht eine
  // Höflichkeit: Die Liste steht am Trupp-Dokument und darf von jedem
  // geschrieben werden, der am Einsatz schreiben darf. Ein Wert mit
  // Schrägstrich würde `user/{uid}` zu einem anderen Pfad zusammensetzen, ein
  // `.` oder `..` ließe das SDK werfen — und die Zahl der Einträge bestimmte
  // sonst der Schreiber.
  const eindeutig = sanitizeUeberwachungUids(uids);
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
      if (tokens.size >= MAX_TOKENS_PRO_SENDUNG) return [...tokens];
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

    // Innerhalb der Fehlerbehandlung je Trupp: Das Lesen der Token greift auf
    // fremd geschriebene Daten zu, und ein Fehler daran darf nicht die
    // Warnungen aller anderen Trupps mitnehmen.
    let tokens: string[];
    try {
      tokens = await tokensFor(trupp.ueberwachungUids);
    } catch (err) {
      console.error(
        `Atemschutzwarnung: Empfänger nicht lesbar (${firecallId}/${doc.id})`,
        err,
      );
      results.push({
        firecallId,
        truppId: doc.id,
        warnung: warnung.key,
        status: 'failed',
        tokenCount: 0,
        error: (err as Error).message,
      });
      continue;
    }

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
      const antwort = await getMessaging().sendEachForMulticast({
        tokens,
        data: push.data as unknown as Record<string, string>,
      });
      // `sendEachForMulticast` wirft **nicht**, wenn einzelne oder alle Token
      // abgelehnt werden — es meldet das in `successCount`. Ohne diese Prüfung
      // würde eine Warnung als verschickt vermerkt, die kein Gerät erreicht
      // hat, und danach nie wieder hinausgehen: bei einer Sicherheitsfunktion
      // die falsche Richtung. Kam nichts durch, bleibt die Warnung offen und
      // der nächste Lauf versucht es erneut.
      if ((antwort?.successCount ?? 0) === 0) {
        console.error(
          `Atemschutzwarnung: kein Gerät erreicht (${firecallId}/${doc.id})`,
          antwort?.responses?.[0]?.error,
        );
        results.push({
          ...basis,
          status: 'failed',
          error: 'keinGeraetErreicht',
        });
        continue;
      }

      // Alle offenen Warnungen vermerken, nicht nur die verschickte: Die
      // überholten Erinnerungen sind mit der dringlicheren Meldung erledigt,
      // und nachträglich zugestellt wären sie irreführend.
      const vermerke = offen.reduce<Record<string, string>>(
        (acc, w) => ({ ...acc, ...warnungVermerk(w.key, jetzt.toISOString()) }),
        {},
      );
      try {
        await doc.ref.update(vermerke);
        results.push({ ...basis, status: 'sent' });
      } catch (err) {
        // Verschickt, aber nicht vermerkt. Getrennt gemeldet, weil sonst genau
        // dieser Fall wie „nicht verschickt" aussähe: Die Warnung geht in einer
        // Minute erneut hinaus, und das soll im Protokoll erkennbar sein statt
        // als rätselhafte Wiederholung.
        console.error(
          `Atemschutzwarnung verschickt, Vermerk fehlgeschlagen (${firecallId}/${doc.id})`,
          err,
        );
        results.push({
          ...basis,
          status: 'sentUnrecorded',
          error: (err as Error).message,
        });
      }
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
