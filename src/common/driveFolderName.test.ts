import { describe, expect, it } from 'vitest';
import {
  escapeDriveQueryValue,
  firecallFolderNaming,
  sanitizeFolderName,
} from './driveFolderName';

const NOW = new Date('2026-08-16T09:00:00Z');

describe('sanitizeFolderName', () => {
  it('keeps spaces in the Einsatz name', () => {
    expect(sanitizeFolderName('Zimmerbrand Hauptstraße')).toBe(
      'Zimmerbrand Hauptstraße',
    );
  });

  it('replaces slashes, which read like a path separator in Drive', () => {
    expect(sanitizeFolderName('B3 / Kreuzung')).toBe('B3 - Kreuzung');
  });

  it('collapses repeated whitespace and trims', () => {
    expect(sanitizeFolderName('  Brand   Mehrfamilienhaus \n')).toBe(
      'Brand Mehrfamilienhaus',
    );
  });

  it('strips control characters', () => {
    expect(sanitizeFolderName('Einsatz\u0007X')).toBe('Einsatz X');
  });

  it('truncates to 120 characters', () => {
    expect(sanitizeFolderName('a'.repeat(200))).toHaveLength(120);
  });
});

describe('escapeDriveQueryValue', () => {
  it('escapes single quotes so the q expression stays intact', () => {
    expect(escapeDriveQueryValue("O'Brien")).toBe("O\\'Brien");
  });

  it('escapes backslashes before quotes', () => {
    expect(escapeDriveQueryValue('a\\b')).toBe('a\\\\b');
  });
});

describe('firecallFolderNaming', () => {
  it('uses the alarm date', () => {
    expect(
      firecallFolderNaming(
        { name: 'Zimmerbrand Hauptstraße', date: '2026-08-16T11:10:00Z' },
        NOW,
      ),
    ).toEqual({
      year: '2026',
      folderName: '2026-08-16_Zimmerbrand Hauptstraße',
    });
  });

  it('formats in Europe/Vienna, not UTC', () => {
    // 2026-08-16T23:30Z ist in Wien bereits der 17.08.
    expect(
      firecallFolderNaming(
        { name: 'Sturmschaden', date: '2026-08-16T23:30:00Z' },
        NOW,
      ).folderName,
    ).toBe('2026-08-17_Sturmschaden');
  });

  it('falls back to the creation date when no alarm date is set', () => {
    expect(
      firecallFolderNaming({ name: 'Übung', created: '2026-03-04T08:00:00Z' }, NOW)
        .folderName,
    ).toBe('2026-03-04_Übung');
  });

  it('falls back to now when neither date is set', () => {
    expect(firecallFolderNaming({ name: 'Übung' }, NOW).folderName).toBe(
      '2026-08-16_Übung',
    );
  });

  it('ignores an unparsable date', () => {
    expect(
      firecallFolderNaming({ name: 'Übung', date: 'kaputt' }, NOW).folderName,
    ).toBe('2026-08-16_Übung');
  });

  it('yields just the date when the name is empty after sanitising', () => {
    expect(
      firecallFolderNaming({ name: '   ', date: '2026-08-16T11:10:00Z' }, NOW),
    ).toEqual({ year: '2026', folderName: '2026-08-16' });
  });
});
