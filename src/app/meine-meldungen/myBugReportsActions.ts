'use server';
import 'server-only';

import { actionUserRequired } from '../auth';
import {
  getBugReport,
  listBugReportComments,
  listBugReports,
  signStoragePaths,
} from '../../server/bugReport/bugReportService';
import {
  toReporterView,
  type BugReportReporterView,
} from '../../common/bugReportReporterView';

/** Mehr hat niemand gemeldet; eine Obergrenze braucht es trotzdem. */
const MY_REPORTS_LIMIT = 100;

/**
 * „Meine Meldungen“: die eigenen Reports in der Projektion für den Melder.
 *
 * Gefragt wird nach `createdBy.uid` — nie nach einer übergebenen UID, sondern
 * nach der aus der Sitzung. Sortiert wird im Speicher, damit die Abfrage ohne
 * zusammengesetzten Index auskommt.
 */
export async function listMyBugReportsAction(): Promise<
  BugReportReporterView[]
> {
  const session = await actionUserRequired();
  const uid = session.user.id;
  if (!uid) return [];
  const reports = await listBugReports({
    createdByUid: uid,
    limit: MY_REPORTS_LIMIT,
  });
  return Promise.all(
    reports.map(async (report) =>
      toReporterView(report, await listBugReportComments(report.id)),
    ),
  );
}

/**
 * Signierte URLs der eigenen Screenshots und Anhänge — erst beim Aufklappen
 * geholt, damit die Liste nicht für jeden Report signiert.
 */
export async function getMyBugReportFilesAction(id: string): Promise<{
  screenshotUrls: string[];
  attachmentUrls: string[];
}> {
  const session = await actionUserRequired();
  const report = await getBugReport(id);
  // Ein fremder Report ist für den Melder dasselbe wie ein fehlender — die
  // Meldung verrät nicht, dass es die ID gibt.
  if (!report || !session.user.id || report.createdBy?.uid !== session.user.id) {
    throw new Error('Meldung nicht gefunden');
  }
  // Nur Pfade im Ordner des Reports, siehe isBugReportStoragePath.
  const view = toReporterView(report, []);
  const [screenshotUrls, attachmentUrls] = await Promise.all([
    signStoragePaths(view.screenshots),
    signStoragePaths(view.attachments),
  ]);
  return { screenshotUrls, attachmentUrls };
}
