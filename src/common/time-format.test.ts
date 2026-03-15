import { describe, it, expect } from 'vitest';
import { formatTimestamp, parseTimestamp, dateTimeFormat } from './time-format';

describe('formatTimestamp', () => {
  it('formats a Date object in DD.MM.YYYY HH:mm:ss', () => {
    const date = new Date('2024-06-15T10:30:00.000Z');
    const result = formatTimestamp(date);
    // Check format shape regardless of local timezone
    expect(result).toMatch(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}$/);
  });

  it('formats an ISO string', () => {
    const result = formatTimestamp('2024-01-01T00:00:00.000Z');
    expect(result).toMatch(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}$/);
  });

  it('returns a valid format string for undefined input', () => {
    // moment(undefined) is the current time — just check format shape
    const result = formatTimestamp(undefined);
    expect(result).toMatch(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}$/);
  });
});

describe('parseTimestamp', () => {
  it('returns undefined for undefined input', () => {
    expect(parseTimestamp(undefined)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(parseTimestamp('')).toBeUndefined();
  });

  it('parses ISO 8601 format', () => {
    const result = parseTimestamp('2024-06-15T10:30:00');
    expect(result).toBeDefined();
    expect(result!.isValid()).toBe(true);
    expect(result!.year()).toBe(2024);
    expect(result!.month()).toBe(5); // moment months are 0-indexed
    expect(result!.date()).toBe(15);
  });

  it('parses German date-time format DD.MM.YYYY HH:mm:ss', () => {
    const result = parseTimestamp('15.06.2024 10:30:00');
    expect(result).toBeDefined();
    expect(result!.isValid()).toBe(true);
    expect(result!.year()).toBe(2024);
    expect(result!.date()).toBe(15);
  });

  it('parses German date-only format DD.MM.YYYY', () => {
    const result = parseTimestamp('15.06.2024');
    expect(result).toBeDefined();
    expect(result!.isValid()).toBe(true);
    expect(result!.year()).toBe(2024);
  });

  it('returns undefined for clearly invalid input', () => {
    const result = parseTimestamp('not-a-date');
    expect(result).toBeUndefined();
  });
});
