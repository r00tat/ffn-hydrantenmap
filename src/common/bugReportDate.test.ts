import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { formatBugReportDate, toBugReportDate } from './bugReportDate';

const ISO = '2026-05-11T10:00:00.000Z';
const MILLIS = Date.parse(ISO);

describe('toBugReportDate', () => {
  it('passes a Date through', () => {
    const d = new Date(MILLIS);
    expect(toBugReportDate(d)).toBe(d);
  });

  it('parses an ISO string', () => {
    expect(toBugReportDate(ISO)?.getTime()).toBe(MILLIS);
  });

  it('converts a Firestore Timestamp via toDate()', () => {
    expect(toBugReportDate(Timestamp.fromMillis(MILLIS))?.getTime()).toBe(
      MILLIS,
    );
  });

  it('converts a serialized Timestamp (_seconds/_nanoseconds)', () => {
    expect(
      toBugReportDate({
        _seconds: MILLIS / 1000,
        _nanoseconds: 0,
      } as never)?.getTime(),
    ).toBe(MILLIS);
  });

  it('converts a serialized Timestamp (seconds/nanoseconds)', () => {
    expect(
      toBugReportDate({
        seconds: MILLIS / 1000,
        nanoseconds: 0,
      } as never)?.getTime(),
    ).toBe(MILLIS);
  });

  it('returns null for undefined, an invalid string and an unknown object', () => {
    expect(toBugReportDate(undefined)).toBeNull();
    expect(toBugReportDate('kein datum')).toBeNull();
    // e.g. an unresolved FieldValue.serverTimestamp() sentinel
    expect(toBugReportDate({ _methodName: 'serverTimestamp' } as never)).toBeNull();
  });
});

describe('formatBugReportDate', () => {
  it('formats in Europe/Vienna (CEST is UTC+2 in May)', () => {
    expect(formatBugReportDate(ISO, { timeZone: 'Europe/Vienna' })).toBe(
      '11.05.2026, 12:00',
    );
  });

  it('adds seconds when requested', () => {
    expect(
      formatBugReportDate(ISO, { timeZone: 'Europe/Vienna', withSeconds: true }),
    ).toBe('11.05.2026, 12:00:00');
  });

  it('formats a Firestore Timestamp', () => {
    expect(
      formatBugReportDate(Timestamp.fromMillis(MILLIS), {
        timeZone: 'Europe/Vienna',
      }),
    ).toBe('11.05.2026, 12:00');
  });

  it('never renders an object placeholder for unresolvable values', () => {
    for (const value of [
      undefined,
      { _methodName: 'serverTimestamp' } as never,
      'kaputt',
    ]) {
      const formatted = formatBugReportDate(value, {
        timeZone: 'Europe/Vienna',
      });
      expect(formatted).toBe('-');
      expect(formatted).not.toContain('[object Object]');
    }
  });
});
