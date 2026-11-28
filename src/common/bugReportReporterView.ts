import {
  BUG_REPORT_REPORTER_VISIBLE_FIELDS,
  BUG_REPORT_STORAGE_PREFIX,
  type BugReport,
  type BugReportChange,
  type BugReportComment,
  type BugReportKind,
  type BugReportStatus,
} from './bugReport';

/**
 * Was der Melder von seinem eigenen Report sieht — auf „Meine Meldungen“ und
 * über MCP ohne Admin-Recht.
 *
 * Die Projektion ist eine Positivliste: Jedes Feld, das hier nicht ausdrücklich
 * steht, bleibt draußen. Damit landet ein neues internes Feld am Report nicht
 * aus Versehen beim Melder. Bewusst nicht enthalten sind `internalNote`,
 * `assignee`, `githubIssue`, `logs`, `context`, `notificationError`,
 * `updatedBy` und die E-Mail-Adressen der Bearbeiter.
 */

export interface BugReportReporterEntry {
  id: string;
  entryType: 'comment' | 'change';
  /** Kommentartext; leer bei einer Feldänderung. */
  text: string;
  /** Nur die für den Melder sichtbaren Feldänderungen (Status, Lösung). */
  changes?: BugReportChange[];
  createdAt: BugReportComment['createdAt'];
  /** Anzeigename des Bearbeiters, ohne E-Mail-Adresse. */
  authorName?: string;
}

export interface BugReportReporterView {
  id: string;
  kind: BugReportKind;
  title: string;
  description: string;
  status: BugReportStatus;
  createdAt: BugReport['createdAt'];
  updatedAt?: BugReport['updatedAt'];
  resolution?: string;
  /** Storage-Pfade der eigenen Screenshots, nur unter `bugReports/<id>/`. */
  screenshots: string[];
  /** Storage-Pfade der eigenen Anhänge, nur unter `bugReports/<id>/`. */
  attachments: string[];
  entries: BugReportReporterEntry[];
}

/**
 * Liegt der Pfad im Storage-Ordner genau dieses Reports?
 *
 * Die Pfade in `screenshots`/`attachments` schickt der Browser beim Melden
 * mit. Ohne diese Prüfung könnte ein Melder einen beliebigen Storage-Pfad
 * eintragen und sich über „Meine Meldungen“ eine signierte URL dafür
 * ausstellen lassen.
 */
export function isBugReportStoragePath(reportId: string, path: string): boolean {
  if (!reportId || typeof path !== 'string') return false;
  const normalized = path.replace(/^\/+/, '');
  const prefix = `${BUG_REPORT_STORAGE_PREFIX}/${reportId}/`;
  if (!normalized.startsWith(prefix)) return false;
  const rest = normalized.slice(prefix.length);
  return rest.length > 0 && !rest.includes('/') && !rest.includes('..');
}

const REPORTER_FIELDS: readonly string[] = BUG_REPORT_REPORTER_VISIBLE_FIELDS;

/**
 * Ist ein Verlaufseintrag für den Melder bestimmt? Ein Kommentar nur mit
 * `visibility: 'reporter'`; eine Feldänderung nur mit ihren Status- und
 * Lösungsänderungen (die übrigen Felder fallen weg).
 */
export function toReporterEntry(
  entry: BugReportComment,
): BugReportReporterEntry | undefined {
  const authorName = entry.createdBy?.displayName || undefined;
  if (entry.entryType === 'comment') {
    if (entry.visibility !== 'reporter') return undefined;
    return {
      id: entry.id,
      entryType: 'comment',
      text: entry.text ?? '',
      createdAt: entry.createdAt,
      ...(authorName ? { authorName } : {}),
    };
  }
  if (entry.entryType === 'change') {
    const changes = (entry.changes ?? [])
      .filter((change) => REPORTER_FIELDS.includes(change.field))
      .map(({ field, from, to }) => ({ field, from, to }));
    if (changes.length === 0) return undefined;
    return {
      id: entry.id,
      entryType: 'change',
      text: '',
      changes,
      createdAt: entry.createdAt,
      ...(authorName ? { authorName } : {}),
    };
  }
  return undefined;
}

export function toReporterView(
  report: BugReport,
  comments: BugReportComment[],
): BugReportReporterView {
  const entries = comments
    .map(toReporterEntry)
    .filter((entry): entry is BugReportReporterEntry => !!entry);
  return {
    id: report.id,
    kind: report.kind,
    title: report.title,
    description: report.description,
    status: report.status,
    createdAt: report.createdAt,
    ...(report.updatedAt ? { updatedAt: report.updatedAt } : {}),
    ...(report.resolution ? { resolution: report.resolution } : {}),
    screenshots: (report.screenshots ?? []).filter((path) =>
      isBugReportStoragePath(report.id, path),
    ),
    attachments: (report.attachments ?? []).filter((path) =>
      isBugReportStoragePath(report.id, path),
    ),
    entries,
  };
}

/** Sortierschlüssel für Zeitstempel in allen drei Formen des Typs. */
export function bugReportTimeValue(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value === 'object') {
    const v = value as { toDate?: () => Date; seconds?: number };
    if (typeof v.toDate === 'function') return v.toDate().getTime();
    if (typeof v.seconds === 'number') return v.seconds * 1000;
  }
  return 0;
}
