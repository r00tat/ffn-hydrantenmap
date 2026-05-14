import 'server-only';
import type { BugReport } from '../../common/bugReport';

interface BuildArgs {
  report: BugReport;
  appBaseUrl: string;
  from: string;
  to: string;
  cc?: string[];
}

interface BuiltEmail {
  subject: string;
  body: string;
  raw: string;
}

export function buildBugReportEmail({
  report,
  appBaseUrl,
  from,
  to,
  cc,
}: BuildArgs): BuiltEmail {
  const kindLabel = report.kind === 'feature' ? 'Feature' : 'Bug';
  const subject = `[${kindLabel}] ${report.title} — ${report.createdBy.email}`;

  const firecall = report.context.firecallName ?? '-';
  const dbLabel = report.context.database || 'prod';
  const userLabel = report.createdBy.displayName
    ? `${report.createdBy.displayName} <${report.createdBy.email}>`
    : report.createdBy.email;

  const body = [
    `Neuer Report (${report.kind}):`,
    '',
    `Titel:     ${report.title}`,
    `User:      ${userLabel}`,
    `Datum:     ${report.createdAt}`,
    `URL:       ${report.context.url}`,
    `Build:     ${report.context.buildId} (${dbLabel})`,
    `Plattform: ${report.context.platform}`,
    `Firecall:  ${firecall}`,
    '',
    'Beschreibung:',
    report.description,
    '',
    `Direkt-Link: ${appBaseUrl.replace(/\/$/, '')}/admin/bug-reports/${report.id}`,
  ].join('\r\n');

  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    ...(cc && cc.length > 0 ? [`Cc: ${cc.join(', ')}`] : []),
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
