import 'server-only';

import type {
  BugReport,
  BugReportChange,
  BugReportStatus,
} from '../../common/bugReport';

/** Status, bei denen der Melder erfährt, dass sein Report erledigt ist. */
const FINAL_STATUSES: readonly BugReportStatus[] = ['closed', 'wontfix'];

/** Statusbezeichnungen der Mail. Die Mail geht deutsch hinaus, wie die übrigen. */
const STATUS_LABELS: Record<BugReportStatus, string> = {
  open: 'Offen',
  in_progress: 'In Bearbeitung',
  closed: 'Erledigt',
  wontfix: 'Wird nicht umgesetzt',
};

export interface ReporterNotificationInput {
  /** Der Report nach der Änderung. */
  report: BugReport;
  /** Feldänderungen dieses Speicherns. */
  changes?: BugReportChange[];
  /** Ein für den Melder sichtbarer Kommentar. */
  comment?: string;
}

/**
 * Gibt es etwas, das der Melder erfahren soll? Nur ein Abschluss
 * (Erledigt/Wird nicht umgesetzt), eine neue Lösung oder ein Kommentar für
 * ihn. Zuständigkeit, GitHub-Issue und interne Notiz sind kein Anlass — der
 * Melder sieht sie nicht einmal.
 */
export function hasReporterNews({
  changes = [],
  comment,
}: Omit<ReporterNotificationInput, 'report'>): boolean {
  if (comment?.trim()) return true;
  return changes.some(
    (change) =>
      (change.field === 'status' &&
        FINAL_STATUSES.includes(change.to as BugReportStatus)) ||
      (change.field === 'resolution' && change.to.trim() !== ''),
  );
}

/** Eine Adresse für den `To:`-Header — nichts, was weitere Header einschleust. */
export function isSafeMailAddress(value: string | undefined): value is string {
  return (
    typeof value === 'string' &&
    /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(value)
  );
}

export interface BuildReporterEmailArgs extends ReporterNotificationInput {
  appBaseUrl: string;
  from: string;
  to: string;
}

export function buildReporterNotificationEmail({
  report,
  changes = [],
  comment,
  appBaseUrl,
  from,
  to,
}: BuildReporterEmailArgs): { subject: string; body: string; raw: string } {
  const statusLabel = STATUS_LABELS[report.status] ?? report.status;
  const subject = `Deine Meldung „${report.title}“: ${statusLabel}`;
  const statusChanged = changes.some((change) => change.field === 'status');
  const resolutionChanged = changes.some(
    (change) => change.field === 'resolution' && change.to.trim() !== '',
  );

  const lines = [
    'Hallo,',
    '',
    `zu deiner Meldung „${report.title}“ gibt es Neuigkeiten.`,
    '',
    `Status: ${statusLabel}${statusChanged ? ' (geändert)' : ''}`,
  ];
  if (report.resolution) {
    lines.push(
      '',
      resolutionChanged ? 'Lösung (neu):' : 'Lösung:',
      report.resolution,
    );
  }
  if (comment?.trim()) {
    lines.push('', 'Neuer Kommentar:', comment.trim());
  }
  lines.push(
    '',
    `Alle deine Meldungen: ${appBaseUrl.replace(/\/$/, '')}/meine-meldungen`,
    '',
    'Diese Nachricht wurde von der Einsatzkarte verschickt.',
  );
  const body = lines.join('\r\n');

  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].join('\r\n');
  const textPart = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body).toString('base64'),
  ].join('\r\n');
  const raw = [headers, '', textPart, `--${boundary}--`].join('\r\n');
  return { subject, body, raw };
}
