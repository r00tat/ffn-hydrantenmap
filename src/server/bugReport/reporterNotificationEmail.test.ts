import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { buildReporterNotificationEmail, hasReporterNews, isSafeMailAddress } =
  await import('./reporterNotificationEmail');
import type { BugReport } from '../../common/bugReport';

const report = {
  id: 'r1',
  kind: 'bug',
  title: 'Karte lädt nicht',
  status: 'closed',
  resolution: 'Behoben in 2.0',
  internalNote: 'nur intern',
  assignee: 'Max Muster',
  createdBy: { uid: 'u1', email: 'melder@example.org' },
} as unknown as BugReport;

describe('hasReporterNews', () => {
  it('meldet einen Abschluss', () => {
    expect(
      hasReporterNews({
        changes: [{ field: 'status', from: 'open', to: 'closed' }],
      }),
    ).toBe(true);
    expect(
      hasReporterNews({
        changes: [{ field: 'status', from: 'open', to: 'wontfix' }],
      }),
    ).toBe(true);
  });

  it('meldet keinen Zwischenstand und keine internen Felder', () => {
    expect(
      hasReporterNews({
        changes: [
          { field: 'status', from: 'open', to: 'in_progress' },
          { field: 'assignee', from: '', to: 'Max' },
          { field: 'internalNote', from: '', to: 'x' },
          { field: 'resolution', from: 'alt', to: '' },
        ],
      }),
    ).toBe(false);
  });

  it('meldet eine neue Lösung und einen Kommentar', () => {
    expect(
      hasReporterNews({
        changes: [{ field: 'resolution', from: '', to: 'Behoben' }],
      }),
    ).toBe(true);
    expect(hasReporterNews({ comment: 'Danke!' })).toBe(true);
    expect(hasReporterNews({ comment: '   ' })).toBe(false);
  });
});

describe('isSafeMailAddress', () => {
  it('weist Header-Einschleusung ab', () => {
    expect(isSafeMailAddress('melder@example.org')).toBe(true);
    expect(isSafeMailAddress('a@b.at\r\nBcc: x@y.at')).toBe(false);
    expect(isSafeMailAddress('')).toBe(false);
    expect(isSafeMailAddress(undefined)).toBe(false);
  });
});

describe('buildReporterNotificationEmail', () => {
  it('enthält Status, Lösung, Kommentar und den Link, aber nichts Internes', () => {
    const { subject, body, raw } = buildReporterNotificationEmail({
      report,
      changes: [{ field: 'status', from: 'open', to: 'closed' }],
      comment: 'Bitte neu laden',
      appBaseUrl: 'https://karte.example.org/',
      from: 'noreply@example.org',
      to: 'melder@example.org',
    });
    expect(subject).toBe('Deine Meldung „Karte lädt nicht“: Erledigt');
    expect(body).toContain('Status: Erledigt (geändert)');
    expect(body).toContain('Behoben in 2.0');
    expect(body).toContain('Bitte neu laden');
    expect(body).toContain('https://karte.example.org/meine-meldungen');
    expect(body).not.toContain('nur intern');
    expect(body).not.toContain('Max Muster');
    expect(raw).toContain('To: melder@example.org');
  });
});
