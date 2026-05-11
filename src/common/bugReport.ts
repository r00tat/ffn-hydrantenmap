import { Timestamp } from 'firebase/firestore';

export const BUG_REPORT_COLLECTION = 'bugReport';
export const APP_CONFIG_COLLECTION = 'appConfig';
export const BUG_REPORT_CONFIG_DOC = 'bugReport';
export const BUG_REPORT_STORAGE_PREFIX = 'bugReports';
export const BUG_REPORT_MAX_LOG_ENTRIES = 200;

export type BugReportKind = 'bug' | 'feature';
export type BugReportStatus = 'open' | 'in_progress' | 'closed' | 'wontfix';

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
}

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
