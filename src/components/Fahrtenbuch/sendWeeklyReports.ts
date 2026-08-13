import 'server-only';

import type { Group } from '../../app/groups/groupTypes';
import {
  FAHRTENBUCH_COLLECTION_ID,
  FAHRTENBUCH_CONFIG_COLLECTION_ID,
  FAHRTENBUCH_VEHICLE_COLLECTION_ID,
  type FahrtenbuchConfig,
  type FahrtenbuchEntry,
  type FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import { isValidEmail } from '../../common/kostenersatzEmail';
import {
  FAHRTENBUCH_MANGEL_COLLECTION_ID,
  type Mangel,
} from '../../common/mangel';
import { getBaseUrl } from '../../server/auth/baseUrl';
import { firestore } from '../../server/firebase/admin';
import { mailSender, sendRawMail } from '../../server/mail/sendRawMail';
import { GROUP_COLLECTION_ID } from '../firebase/firestore';
import { buildWeeklyReportEmail } from './buildWeeklyReportEmail';
import { buildWeeklyReportModel } from './weeklyReportModel';
import type { ReportPeriod } from './weeklyReportPeriod';

/**
 * Der Versand der Wochenberichte über alle Gruppen.
 *
 * Getrennt vom Route Handler, damit die Reihenfolge der Abfragen und das
 * Fehlerverhalten ohne HTTP prüfbar sind.
 */

export type WeeklyReportStatus = 'sent' | 'skipped' | 'failed' | 'dryRun';

export interface WeeklyReportResult {
  groupId: string;
  status: WeeklyReportStatus;
  recipientCount: number;
  entryCount: number;
  warningCount: number;
  openMangelCount: number;
  /** Nur bei `failed`. */
  error?: string;
  /** Nur bei `dryRun` — zum Prüfen ohne Versand. */
  subject?: string;
  text?: string;
}

export interface SendWeeklyReportsOptions {
  period: ReportPeriod;
  dryRun?: boolean;
}

function groupRef(groupId: string) {
  return firestore.collection(GROUP_COLLECTION_ID).doc(groupId);
}

/**
 * Die gepflegten Empfänger der Gruppe, auf brauchbare Adressen eingeschränkt.
 *
 * Dieselbe Verteidigung wie in `notifyMangel`: Gespeicherte Daten können älter
 * sein als die Regel, die sie heute durchlässt, und eine kaputte Adresse in der
 * Liste darf nicht dazu führen, dass die Gmail-API die ganze Nachricht ablehnt
 * und auch die gültigen Empfänger nichts erfahren.
 */
function recipientsOf(config: FahrtenbuchConfig | undefined): string[] {
  const stored = config?.mangelEmails;
  if (!Array.isArray(stored)) return [];
  return stored
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => isValidEmail(value));
}

/**
 * Der Name der Gruppe für die Mail — schmückendes Beiwerk, kein Pflichtteil.
 * Ein Fehler beim Lesen darf den Bericht nicht verhindern: Der eigentliche
 * Inhalt steht an den Fahrten und den Mängeln. Wie `groupName()` in
 * `notifyMangel.ts`.
 */
async function groupName(groupId: string): Promise<string | undefined> {
  try {
    const doc = await groupRef(groupId).get();
    return (doc.data() as Group | undefined)?.name;
  } catch (err) {
    console.warn('sendWeeklyReports: Gruppenname nicht lesbar', err, {
      groupId,
    });
    return undefined;
  }
}

async function loadVehicles(groupId: string): Promise<FahrtenbuchVehicle[]> {
  const snapshot = await groupRef(groupId)
    .collection(FAHRTENBUCH_VEHICLE_COLLECTION_ID)
    .get();
  return snapshot.docs.map(
    (doc) => ({ id: doc.id, ...doc.data() }) as FahrtenbuchVehicle,
  );
}

/**
 * Die Fahrten des Zeitraums. Absteigend abgefragt, weil genau dafür ein Index
 * besteht (`deleted ASC, abfahrt DESC`); die Reihenfolge der Ausgabe stellt das
 * Modell her — dieselbe Aufteilung wie im PDF-Export.
 */
async function loadEntries(
  groupId: string,
  period: ReportPeriod,
): Promise<FahrtenbuchEntry[]> {
  const snapshot = await groupRef(groupId)
    .collection(FAHRTENBUCH_COLLECTION_ID)
    .where('deleted', '==', false)
    .where('abfahrt', '>=', period.fromIso)
    .where('abfahrt', '<=', period.toIso)
    .orderBy('abfahrt', 'desc')
    .get();
  return snapshot.docs.map(
    (doc) => ({ id: doc.id, ...doc.data() }) as FahrtenbuchEntry,
  );
}

/**
 * Je Fahrzeug die letzte Fahrt vor dem Zeitraum. Nur damit fällt ein falscher
 * Zählerstand am Wochenanfang auf — der Grund, aus dem es diesen Bericht
 * überhaupt gibt.
 *
 * Gedeckt vom bestehenden Index `vehicleId ASC, deleted ASC, abfahrt DESC`. Die
 * Abfragen laufen parallel: Es ist eine je Fahrzeug, und keine hängt vom
 * Ergebnis einer anderen ab.
 */
async function loadPreviousEntries(
  groupId: string,
  vehicles: FahrtenbuchVehicle[],
  period: ReportPeriod,
): Promise<Record<string, FahrtenbuchEntry | undefined>> {
  const collection = groupRef(groupId).collection(FAHRTENBUCH_COLLECTION_ID);
  const pairs = await Promise.all(
    vehicles.map(async (vehicle) => {
      const snapshot = await collection
        .where('vehicleId', '==', vehicle.id)
        .where('deleted', '==', false)
        .where('abfahrt', '<', period.fromIso)
        .orderBy('abfahrt', 'desc')
        .limit(1)
        .get();
      const doc = snapshot.docs[0];
      return [
        vehicle.id as string,
        doc ? ({ id: doc.id, ...doc.data() } as FahrtenbuchEntry) : undefined,
      ] as const;
    }),
  );
  return Object.fromEntries(pairs);
}

/**
 * Alle Mängel der Gruppe, nach Meldedatum. Der Status wird im Modell gefiltert
 * und nicht in der Abfrage: Ein `where` auf `status` bräuchte einen weiteren
 * zusammengesetzten Index — dieselbe Entscheidung wie im Client
 * (`useFahrtenbuchMangel`).
 */
async function loadMangel(groupId: string): Promise<Mangel[]> {
  const snapshot = await groupRef(groupId)
    .collection(FAHRTENBUCH_MANGEL_COLLECTION_ID)
    .orderBy('reportedAt', 'desc')
    .get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Mangel);
}

/**
 * Die Fahrzeuge des Berichts: die aktiven plus alle mit Fahrten im Zeitraum.
 *
 * Ein außer Dienst gestelltes Fahrzeug soll nicht jede Woche „keine Fahrten"
 * melden — eine erfasste Fahrt darf aber unter keinen Umständen verschwinden.
 *
 * Ein fehlender `sortOrder` sortiert nach hinten und nicht wie eine 0 nach
 * vorn: Ein Fahrzeug ohne gepflegte Reihenfolge würde sonst die eingestellte
 * Ordnung der anderen von vorne aufbrechen.
 */
function reportVehicles(
  vehicles: FahrtenbuchVehicle[],
  entries: FahrtenbuchEntry[],
): FahrtenbuchVehicle[] {
  const withEntries = new Set(
    entries.filter((e) => !e.deleted).map((e) => e.vehicleId),
  );
  return vehicles
    .filter((v) => v.active !== false || withEntries.has(v.id as string))
    .sort(
      (a, b) =>
        (a.sortOrder ?? Number.MAX_SAFE_INTEGER) -
          (b.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
        (a.name ?? '').localeCompare(b.name ?? '', 'de'),
    );
}

async function reportForGroup(
  groupId: string,
  recipients: string[],
  period: ReportPeriod,
  appBaseUrl: string,
  dryRun: boolean,
): Promise<WeeklyReportResult> {
  // Die vier Abfragen hängen nicht voneinander ab; nur die Vorgängerfahrten
  // brauchen die Fahrzeugauswahl und kommen deshalb danach.
  const [name, vehicles, entries, mangel] = await Promise.all([
    groupName(groupId),
    loadVehicles(groupId),
    loadEntries(groupId, period),
    loadMangel(groupId),
  ]);

  const selected = reportVehicles(vehicles, entries);
  const previousEntries = await loadPreviousEntries(groupId, selected, period);

  const model = buildWeeklyReportModel({
    groupId,
    groupName: name,
    period,
    vehicles: selected,
    entries,
    previousEntries,
    openMangel: mangel,
  });

  const from = mailSender();
  if (!from) {
    throw new Error('Email service not configured');
  }

  const [to, ...cc] = recipients;
  const { subject, text, raw } = buildWeeklyReportEmail({
    model,
    appBaseUrl,
    from,
    to,
    cc,
  });

  const warningCount = model.vehicles.reduce(
    (sum, v) => sum + v.warnings.length,
    0,
  );
  const base = {
    groupId,
    recipientCount: recipients.length,
    entryCount: model.entryCount,
    warningCount,
    openMangelCount: model.openMangel.length,
  };

  // Bei `dryRun` ist alles gebaut und nichts verschickt — Betreff und Text
  // gehen mit zurück, damit ein Lauf ohne Versand prüfbar bleibt.
  if (dryRun) return { ...base, status: 'dryRun', subject, text };

  await sendRawMail(raw);
  return { ...base, status: 'sent' };
}

export async function sendWeeklyReports({
  period,
  dryRun = false,
}: SendWeeklyReportsOptions): Promise<WeeklyReportResult[]> {
  const configs = await firestore
    .collection(FAHRTENBUCH_CONFIG_COLLECTION_ID)
    .get();
  // Einmal für den ganzen Lauf: Die Basis-URL ist für alle Gruppen dieselbe.
  const appBaseUrl = await getBaseUrl();
  const results: WeeklyReportResult[] = [];

  // Bewusst der Reihe nach und nicht parallel: Der Lauf verschickt Mails über
  // eine geteilte Gmail-Quote, und die Zahl der Gruppen ist einstellig.
  for (const doc of configs.docs) {
    const groupId = doc.id;
    const recipients = recipientsOf(doc.data() as FahrtenbuchConfig | undefined);
    // Eine leere Empfängerliste ist die vorgesehene Abschaltung und kein
    // Fehler — dieselbe Auslegung wie in `notifyMangel`.
    if (recipients.length === 0) {
      results.push({
        groupId,
        status: 'skipped',
        recipientCount: 0,
        entryCount: 0,
        warningCount: 0,
        openMangelCount: 0,
      });
      continue;
    }

    try {
      results.push(
        await reportForGroup(groupId, recipients, period, appBaseUrl, dryRun),
      );
    } catch (err) {
      // Ein Fehler bei einer Gruppe darf die anderen nicht um ihren Bericht
      // bringen: Der Lauf geht weiter, das Ergebnis hält den Fehler fest.
      console.error('sendWeeklyReports: Gruppe fehlgeschlagen', err, {
        groupId,
      });
      results.push({
        groupId,
        status: 'failed',
        recipientCount: recipients.length,
        entryCount: 0,
        warningCount: 0,
        openMangelCount: 0,
        error: err instanceof Error ? err.message : 'unbekannter Fehler',
      });
    }
  }

  return results;
}
