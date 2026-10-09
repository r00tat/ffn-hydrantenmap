import 'server-only';

import type { Group } from '../../app/groups/groupTypes';
import {
  GERAET_BESTAND_COLLECTION,
  GERAET_COLLECTION,
  type Geraet,
  type GeraetBestand,
} from '../../common/geraet';
import { expiringChargen } from '../../common/geraetCharge';
import { getBaseUrl } from '../../server/auth/baseUrl';
import { firestore } from '../../server/firebase/admin';
import { mailSender, sendRawMail } from '../../server/mail/sendRawMail';
import { GROUP_COLLECTION_ID } from '../firebase/firestore';
import { buildAblaufEmail } from './buildAblaufEmail';
import { mangelRecipients } from './notifyNachbestellung';

/**
 * Die wöchentliche Sammelmail zu abgelaufenen und bald ablaufenden Chargen,
 * über alle Gruppen.
 *
 * Getrennt vom Route Handler, damit Abfragen und Fehlerverhalten ohne HTTP
 * prüfbar sind — dieselbe Aufteilung wie beim Wochenbericht des Fahrtenbuchs.
 */

export type AblaufReportStatus = 'sent' | 'skipped' | 'failed' | 'dryRun';

export interface AblaufReportResult {
  groupId: string;
  status: AblaufReportStatus;
  /** Zahl der gemeldeten (bzw. zu meldenden) Chargen. */
  count: number;
  /** Nur bei `failed`. */
  error?: string;
  /** Nur bei `dryRun` — zum Prüfen ohne Versand. */
  subject?: string;
  text?: string;
}

export interface SendAblaufReportsOptions {
  dryRun?: boolean;
  /** Für Tests; sonst die aktuelle Zeit. */
  now?: Date;
}

/** Die Frist hängt am Kalendertag in Wien, nicht in UTC. */
const REPORT_TIME_ZONE = 'Europe/Vienna';

/** `sv-SE` liefert `YYYY-MM-DD` — siehe `driveFolderName.ts`. */
function todayInVienna(now: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: REPORT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function groupRef(groupId: string) {
  return firestore.collection(GROUP_COLLECTION_ID).doc(groupId);
}

async function loadGeraete(groupId: string): Promise<Geraet[]> {
  const snapshot = await groupRef(groupId).collection(GERAET_COLLECTION).get();
  return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as Geraet);
}

async function loadBestaende(groupId: string): Promise<GeraetBestand[]> {
  const snapshot = await groupRef(groupId).collection(GERAET_BESTAND_COLLECTION).get();
  return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as GeraetBestand);
}

/**
 * Eine Gruppe. `undefined` heißt: Die Gruppe führt keine Geräte und taucht im
 * Ergebnis gar nicht auf — sonst stünde jede Gruppe ohne Lager jede Woche als
 * „übersprungen" im Protokoll.
 */
async function reportForGroup(
  groupId: string,
  groupName: string | undefined,
  todayIso: string,
  baseUrl: string,
  dryRun: boolean,
): Promise<AblaufReportResult | undefined> {
  let count = 0;
  try {
    const geraete = await loadGeraete(groupId);
    if (geraete.length === 0) return undefined;

    // Den Bestand nur laden, wenn überhaupt ein Artikel Chargen mit Ablauf hat
    // — für die meisten Gruppen und Wochen bleibt es so bei einer Abfrage.
    const hasDated = geraete.some((g) => g.chargen?.some((c) => c.ablaufDatum));
    if (!hasDated) return { groupId, status: 'skipped', count: 0 };

    const items = expiringChargen(geraete, await loadBestaende(groupId), todayIso);
    count = items.length;
    if (count === 0) return { groupId, status: 'skipped', count };

    // Eine leere Empfängerliste ist die vorgesehene Abschaltung, kein Fehler.
    const [to, ...cc] = await mangelRecipients(groupId);
    if (!to) return { groupId, status: 'skipped', count };

    const from = mailSender();
    if (!from) throw new Error('Email service not configured');

    const { subject, text, raw } = buildAblaufEmail({
      items,
      groupName,
      baseUrl,
      from,
      to,
      cc,
    });
    if (dryRun) return { groupId, status: 'dryRun', count, subject, text };

    await sendRawMail(raw);
    return { groupId, status: 'sent', count };
  } catch (err) {
    console.error('sendAblaufReports: Gruppe fehlgeschlagen', err, { groupId });
    return {
      groupId,
      status: 'failed',
      count,
      error: err instanceof Error ? err.message : 'unbekannter Fehler',
    };
  }
}

export async function sendAblaufReports({
  dryRun = false,
  now = new Date(),
}: SendAblaufReportsOptions = {}): Promise<AblaufReportResult[]> {
  const groups = await firestore.collection(GROUP_COLLECTION_ID).get();
  const todayIso = todayInVienna(now);
  const baseUrl = await getBaseUrl();
  const results: AblaufReportResult[] = [];

  // Der Reihe nach: geteilte Gmail-Quote, einstellige Zahl an Gruppen. Ein
  // Fehler einer Gruppe wird in `reportForGroup` zum Ergebnis und hält die
  // übrigen nicht auf.
  for (const doc of groups.docs) {
    const name = (doc.data() as Group | undefined)?.name;
    const result = await reportForGroup(doc.id, name, todayIso, baseUrl, dryRun);
    if (result) results.push(result);
  }
  return results;
}
