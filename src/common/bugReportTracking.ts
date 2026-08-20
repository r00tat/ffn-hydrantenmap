import {
  BUG_REPORT_COMMENT_MAX_LENGTH,
  BUG_REPORT_SHORT_FIELD_MAX_LENGTH,
  BUG_REPORT_STATUSES,
  BUG_REPORT_TRACKED_FIELDS,
  type BugReport,
  type BugReportChange,
  type BugReportStatus,
  type BugReportUpdateInput,
} from './bugReport';

/** Repository, in dem die Issues zu diesem Projekt liegen. */
export const BUG_REPORT_GITHUB_REPO = 'r00tat/ffn-hydrantenmap';

export interface BugReportIssueRef {
  /** Ziel des Links. */
  url: string;
  /** Kurzform für die Anzeige, z.B. `#704`. */
  label: string;
  number?: number;
  repo?: string;
}

const GITHUB_ISSUE_PATH = /^\/([^/]+\/[^/]+)\/(?:issues|pull)\/(\d+)$/;

/**
 * Nimmt, was im Admin-Bereich eingetippt wird: eine Issue-Nummer (`704`,
 * `#704`), eine GitHub-URL oder die URL eines anderen Trackers. Ergibt `null`,
 * wenn sich daraus kein Link bilden lässt.
 */
export function parseBugReportIssueRef(
  value: string | undefined | null,
): BugReportIssueRef | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;

  const numberMatch = /^#?(\d+)$/.exec(raw);
  if (numberMatch) {
    const number = Number.parseInt(numberMatch[1], 10);
    if (number <= 0) return null;
    return {
      url: `https://github.com/${BUG_REPORT_GITHUB_REPO}/issues/${number}`,
      label: `#${number}`,
      number,
      repo: BUG_REPORT_GITHUB_REPO,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return null;
  }

  if (parsed.hostname === 'github.com' || parsed.hostname === 'www.github.com') {
    const pathMatch = GITHUB_ISSUE_PATH.exec(parsed.pathname.replace(/\/$/, ''));
    if (pathMatch) {
      const repo = pathMatch[1];
      const number = Number.parseInt(pathMatch[2], 10);
      return {
        url: raw,
        label:
          repo === BUG_REPORT_GITHUB_REPO ? `#${number}` : `${repo}#${number}`,
        number,
        repo,
      };
    }
  }

  return { url: raw, label: raw };
}

/**
 * Link auf ein neues GitHub-Issue, mit Titel, Label und dem Kontext des
 * Reports vorbefüllt. Bewusst ein Link und kein API-Aufruf: dafür bräuchte der
 * Dienst ein Token, und angelegt wird das Issue ohnehin von Hand.
 */
export function buildBugReportIssueDraftUrl(report: BugReport): string {
  const context = report.context;
  const lines = [
    report.description ?? '',
    '',
    '---',
    `Bug-Report: \`${report.id}\``,
    `Melder: ${report.createdBy?.email ?? '-'}`,
    `URL: ${context?.url ?? '-'}`,
    `Build: ${context?.buildId ?? '-'} (${context?.database || 'prod'})`,
    `Plattform: ${context?.platform ?? '-'}${
      context?.isNative ? ' (native)' : ''
    }`,
  ];
  if (context?.firecallName) {
    lines.push(`Einsatz: ${context.firecallName}`);
  }

  const params = new URLSearchParams({
    title: report.title ?? '',
    labels: report.kind === 'feature' ? 'feature' : 'bug',
    body: lines.join('\n'),
  });
  return `https://github.com/${BUG_REPORT_GITHUB_REPO}/issues/new?${params}`;
}

function normalizeText(
  field: string,
  value: string,
  maxLength: number,
): string {
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new Error(
      `${field}: Wert ist zu lang (${trimmed.length} von maximal ${maxLength} Zeichen)`,
    );
  }
  return trimmed;
}

/**
 * Prüft und normalisiert, was aus dem Browser kommt. Ein geleertes Feld bleibt
 * als leerer String erhalten — die Action unterscheidet daran „gelöscht" von
 * „nicht angefasst" (fehlender Schlüssel).
 */
export function normalizeBugReportUpdate(
  patch: BugReportUpdateInput,
): BugReportUpdateInput {
  const out: BugReportUpdateInput = {};

  if (patch.status !== undefined) {
    if (!BUG_REPORT_STATUSES.includes(patch.status)) {
      throw new Error(`Unbekannter Status: ${patch.status}`);
    }
    out.status = patch.status as BugReportStatus;
  }

  if (patch.githubIssue !== undefined) {
    const raw = normalizeText(
      'GitHub-Issue',
      patch.githubIssue,
      BUG_REPORT_SHORT_FIELD_MAX_LENGTH,
    );
    if (!raw) {
      out.githubIssue = '';
    } else {
      const ref = parseBugReportIssueRef(raw);
      if (!ref) {
        throw new Error(
          `GitHub-Issue: "${raw}" ist weder eine Issue-Nummer noch eine URL`,
        );
      }
      out.githubIssue = ref.url;
    }
  }

  if (patch.assignee !== undefined) {
    out.assignee = normalizeText(
      'Zuständig',
      patch.assignee,
      BUG_REPORT_SHORT_FIELD_MAX_LENGTH,
    );
  }

  if (patch.internalNote !== undefined) {
    out.internalNote = normalizeText(
      'Interne Notiz',
      patch.internalNote,
      BUG_REPORT_COMMENT_MAX_LENGTH,
    );
  }

  return out;
}

/**
 * Vergleicht den gespeicherten Report mit dem normalisierten Patch. Nur was
 * sich tatsächlich ändert, landet im Verlauf — sonst erzeugte jedes Speichern
 * einen Eintrag ohne Inhalt.
 */
export function computeBugReportChanges(
  before: Pick<BugReport, 'status'> & BugReportUpdateInput,
  patch: BugReportUpdateInput,
): BugReportChange[] {
  const changes: BugReportChange[] = [];
  for (const field of BUG_REPORT_TRACKED_FIELDS) {
    const to = patch[field];
    if (to === undefined) continue;
    const from = before[field] ?? '';
    if (from === to) continue;
    changes.push({ field, from, to });
  }
  return changes;
}
