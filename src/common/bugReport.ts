import { Timestamp } from 'firebase/firestore';

export const BUG_REPORT_COLLECTION = 'bugReport';
export const APP_CONFIG_COLLECTION = 'appConfig';
export const BUG_REPORT_CONFIG_DOC = 'bugReport';
export const BUG_REPORT_STORAGE_PREFIX = 'bugReports';
export const BUG_REPORT_MAX_LOG_ENTRIES = 200;
export const BUG_REPORT_COMMENTS_COLLECTION = 'comments';
/** Kommentare und interne Notizen. */
export const BUG_REPORT_COMMENT_MAX_LENGTH = 4000;
/** Einzeiler wie GitHub-Issue und Zuständigkeit. */
export const BUG_REPORT_SHORT_FIELD_MAX_LENGTH = 500;

export type BugReportKind = 'bug' | 'feature';
export type BugReportStatus = 'open' | 'in_progress' | 'closed' | 'wontfix';

export const BUG_REPORT_STATUSES = [
  'open',
  'in_progress',
  'closed',
  'wontfix',
] as const satisfies readonly BugReportStatus[];

/**
 * Ein Kommentar ist entweder von Hand geschrieben (`comment`) oder ein
 * Verlaufseintrag, den eine Feldänderung erzeugt hat (`change`).
 */
export type BugReportEntryType = 'comment' | 'change';

/**
 * `internal` sieht nur der Admin-Bereich (und ein Admin über MCP).
 * `reporter` sieht zusätzlich der Melder auf „Meine Meldungen“
 * (`/meine-meldungen`) und über MCP. Fehlt das Feld an einem alten Eintrag,
 * gilt `internal` — im Zweifel bleibt ein Kommentar intern.
 *
 * Gilt nur für Kommentare (`entryType: 'comment'`). Verlaufseinträge einer
 * Feldänderung werden immer `internal` geschrieben, weil ein Eintrag mehrere
 * Felder umfassen kann; was der Melder davon sieht, entscheidet die Liste
 * `BUG_REPORT_REPORTER_VISIBLE_FIELDS` beim Lesen.
 */
export type BugReportCommentVisibility = 'internal' | 'reporter';

export const BUG_REPORT_COMMENT_VISIBILITIES = [
  'internal',
  'reporter',
] as const satisfies readonly BugReportCommentVisibility[];

/** Felder, deren Änderung im Verlauf festgehalten wird. */
export type BugReportTrackedField =
  | 'status'
  | 'resolution'
  | 'githubIssue'
  | 'assignee'
  | 'internalNote';

export const BUG_REPORT_TRACKED_FIELDS = [
  'status',
  'resolution',
  'githubIssue',
  'assignee',
  'internalNote',
] as const satisfies readonly BugReportTrackedField[];

/**
 * Feldänderungen, die der Melder im Verlauf sieht. Status und Lösung sind
 * genau das, was er wissen will („wurde es behoben?“), und enthalten nichts
 * Internes. Zuständigkeit, GitHub-Issue und interne Notiz bleiben intern —
 * auch wenn sie im selben Verlaufseintrag stehen.
 */
export const BUG_REPORT_REPORTER_VISIBLE_FIELDS = [
  'status',
  'resolution',
] as const satisfies readonly BugReportTrackedField[];

export interface BugReportChange {
  field: BugReportTrackedField;
  from: string;
  to: string;
}

export interface BugReportComment {
  id: string;
  entryType: BugReportEntryType;
  text: string;
  changes?: BugReportChange[];
  visibility: BugReportCommentVisibility;
  createdAt: Timestamp | Date | string;
  createdBy: BugReportCreatedBy;
  /** `'mcp'`, wenn der Eintrag über den MCP-Server entstanden ist. */
  source?: string;
  /** `client_id` der MCP-Anwendung, die geschrieben hat. */
  mcpClientId?: string;
  /** Anzeigename der MCP-Anwendung. */
  mcpClientName?: string;
}

export interface BugReportLogEntry {
  message: string;
  level?: string;
  properties?: Record<string, unknown>;
}

export interface BugReportContext {
  url: string;
  pathname: string;
  buildId: string;
  database: string;
  userAgent: string;
  platform: string;
  isNative: boolean;
  firecallId?: string;
  firecallName?: string;
  viewport: { width: number; height: number };
  locale: string;
}

export interface BugReportCreatedBy {
  uid: string;
  email: string;
  displayName?: string;
}

export interface BugReport {
  id: string;
  kind: BugReportKind;
  title: string;
  description: string;
  status: BugReportStatus;
  createdAt: Timestamp | Date | string;
  createdBy: BugReportCreatedBy;
  context: BugReportContext;
  logs: BugReportLogEntry[];
  screenshots: string[];
  attachments: string[];
  notificationError?: string;
  updatedAt?: Timestamp | Date | string;
  updatedBy?: BugReportCreatedBy;
  /** Verknüpftes GitHub-Issue, normalisiert als URL. */
  githubIssue?: string;
  /** Wer sich um den Report kümmert (freier Text). */
  assignee?: string;
  /** Interne Einordnung, unabhängig vom Kommentar-Verlauf. */
  internalNote?: string;
  /**
   * Lösung bzw. Rückmeldung an den Melder — sichtbar auf „Meine Meldungen“.
   * Anders als `internalNote` ist das ausdrücklich für den Melder geschrieben.
   */
  resolution?: string;
}

/** Änderbare Felder eines Reports. Was fehlt, bleibt unangetastet. */
export type BugReportUpdateInput = Partial<
  Pick<
    BugReport,
    'status' | 'resolution' | 'githubIssue' | 'assignee' | 'internalNote'
  >
>;

export interface BugReportSubmitInput {
  reportId: string;
  kind: BugReportKind;
  title: string;
  description: string;
  context: BugReportContext;
  logs: BugReportLogEntry[];
  screenshots: string[];
  attachments: string[];
}

export interface BugReportConfig {
  recipientEmails: string[];
  enabled: boolean;
  updatedAt?: Timestamp | Date | string;
  updatedBy?: BugReportCreatedBy;
}

export const DEFAULT_BUG_REPORT_CONFIG: BugReportConfig = {
  recipientEmails: [],
  enabled: true,
};
