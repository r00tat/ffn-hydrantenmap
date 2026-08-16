import type { BugReport } from './bugReport';

/**
 * A `createdAt`/`updatedAt` value can reach us in several shapes: as a
 * Firestore `Timestamp` (client or admin SDK), as the `{_seconds, _nanoseconds}`
 * object a Timestamp serializes to when it crosses the server/client boundary,
 * as a `Date`, or as an ISO string. Anything else — most notably an unresolved
 * `FieldValue.serverTimestamp()` sentinel — must not be rendered raw, or it
 * shows up as `[object Object]` (siehe #670).
 */
export type BugReportDateValue = BugReport['createdAt'] | undefined | null;

interface SerializedTimestamp {
  _seconds?: number;
  seconds?: number;
  _nanoseconds?: number;
  nanoseconds?: number;
  toDate?: () => Date;
}

export function toBugReportDate(value: BugReportDateValue): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  const ts = value as unknown as SerializedTimestamp;
  if (typeof ts.toDate === 'function') {
    const date = ts.toDate();
    return date instanceof Date && !isNaN(date.getTime()) ? date : null;
  }

  const seconds = ts._seconds ?? ts.seconds;
  if (typeof seconds === 'number') {
    const nanos = ts._nanoseconds ?? ts.nanoseconds ?? 0;
    return new Date(seconds * 1000 + Math.floor(nanos / 1e6));
  }
  return null;
}

export interface FormatBugReportDateOptions {
  /** Explicit time zone — required on the server, where TZ is usually UTC. */
  timeZone?: string;
  withSeconds?: boolean;
}

export function formatBugReportDate(
  value: BugReportDateValue,
  { timeZone, withSeconds = false }: FormatBugReportDateOptions = {},
): string {
  const date = toBugReportDate(value);
  if (!date) return '-';
  return date.toLocaleString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' as const } : {}),
    ...(timeZone ? { timeZone } : {}),
  });
}
