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
 * `internal` sieht nur der Admin-Bereich. `reporter` ist für eine künftige
 * Ansicht des Melders vorgesehen; geschrieben wird derzeit ausschließlich
 * `internal`. Das Feld steht von Anfang an am Kommentar, weil sich die
 * Sichtbarkeit eines bereits geschriebenen Kommentars nachträglich nicht
 * mehr feststellen lässt.
 */
export type BugReportCommentVisibility = 'internal' | 'reporter';

/** Felder, deren Änderung im Verlauf festgehalten wird. */
export type BugReportTrackedField =
  | 'status'
  | 'githubIssue'
  | 'assignee'
  | 'internalNote';

export const BUG_REPORT_TRACKED_FIELDS = [
  'status',
  'githubIssue',
  'assignee',
  'internalNote',
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
}

/** Änderbare Felder eines Reports. Was fehlt, bleibt unangetastet. */
export type BugReportUpdateInput = Partial<
  Pick<BugReport, 'status' | 'githubIssue' | 'assignee' | 'internalNote'>
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
