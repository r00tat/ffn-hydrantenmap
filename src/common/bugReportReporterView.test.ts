import { describe, expect, it } from 'vitest';
import type { BugReport, BugReportComment } from './bugReport';
import {
  bugReportTimeValue,
  isBugReportStoragePath,
  toReporterView,
} from './bugReportReporterView';

const report = {
  id: 'r1',
  kind: 'bug',
  title: 'Karte lädt nicht',
  description: 'Beim Öffnen bleibt sie grau',
  status: 'closed',
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-02T10:00:00.000Z',
  createdBy: { uid: 'u1', email: 'melder@example.org' },
  context: { url: 'https://x/geheim', userAgent: 'UA' },
  logs: [{ message: 'token=abc' }],
  screenshots: ['bugReports/r1/a.png', '/bugReports/r1/b.png'],
  attachments: ['bugReports/r1/c.pdf'],
  notificationError: 'smtp down',
  updatedBy: { uid: 'admin', email: 'admin@example.org' },
  githubIssue: 'https://github.com/r00tat/ffn-hydrantenmap/issues/1',
  assignee: 'Max Muster',
  internalNote: 'nur intern',
  resolution: 'Behoben in Version 2.0',
} as unknown as BugReport;

function comment(partial: Partial<BugReportComment>): BugReportComment {
  return {
    id: 'c',
    entryType: 'comment',
    text: '',
    visibility: 'internal',
    createdAt: '2026-11-01T11:00:00.000Z',
    createdBy: {
      uid: 'admin',
      email: 'admin@example.org',
      displayName: 'Erika Beispiel',
    },
    ...partial,
  };
}

describe('toReporterView', () => {
  it('nimmt nur die für den Melder bestimmten Felder mit', () => {
    const view = toReporterView(report, []);
    expect(view).toEqual({
      id: 'r1',
      kind: 'bug',
      title: 'Karte lädt nicht',
      description: 'Beim Öffnen bleibt sie grau',
      status: 'closed',
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-02T10:00:00.000Z',
      resolution: 'Behoben in Version 2.0',
      screenshots: ['bugReports/r1/a.png', '/bugReports/r1/b.png'],
      attachments: ['bugReports/r1/c.pdf'],
      entries: [],
    });
    const json = JSON.stringify(view);
    for (const secret of [
      'nur intern',
      'Max Muster',
      'token=abc',
      'geheim',
      'smtp down',
      'admin@example.org',
      'github.com',
    ]) {
      expect(json).not.toContain(secret);
    }
  });

  it('lässt interne Kommentare weg und zeigt Melder-Kommentare ohne E-Mail', () => {
    const view = toReporterView(report, [
      comment({ id: 'c1', text: 'intern', visibility: 'internal' }),
      comment({ id: 'c2', text: 'Danke, ist behoben', visibility: 'reporter' }),
      // Alte Einträge ohne Feld gelten als intern.
      comment({
        id: 'c3',
        text: 'alt',
        visibility: undefined as unknown as 'internal',
      }),
    ]);
    expect(view.entries).toEqual([
      {
        id: 'c2',
        entryType: 'comment',
        text: 'Danke, ist behoben',
        createdAt: '2026-11-01T11:00:00.000Z',
        authorName: 'Erika Beispiel',
      },
    ]);
    expect(JSON.stringify(view.entries)).not.toContain('admin@example.org');
  });

  it('zeigt von Feldänderungen nur Status und Lösung', () => {
    const view = toReporterView(report, [
      comment({
        id: 'h1',
        entryType: 'change',
        changes: [
          { field: 'status', from: 'open', to: 'closed' },
          { field: 'assignee', from: '', to: 'Max Muster' },
          { field: 'resolution', from: '', to: 'Behoben' },
          { field: 'internalNote', from: '', to: 'geheim' },
        ],
      }),
      comment({
        id: 'h2',
        entryType: 'change',
        changes: [{ field: 'githubIssue', from: '', to: 'https://x' }],
      }),
    ]);
    expect(view.entries).toHaveLength(1);
    expect(view.entries[0].changes).toEqual([
      { field: 'status', from: 'open', to: 'closed' },
      { field: 'resolution', from: '', to: 'Behoben' },
    ]);
  });

  it('verwirft Storage-Pfade außerhalb des eigenen Report-Ordners', () => {
    const view = toReporterView(
      {
        ...report,
        screenshots: [
          'bugReports/r1/ok.png',
          'bugReports/r2/fremd.png',
          'groups/ffnd/geheim.pdf',
          'bugReports/r1/../r2/x.png',
        ],
        attachments: undefined as unknown as string[],
      },
      [],
    );
    expect(view.screenshots).toEqual(['bugReports/r1/ok.png']);
    expect(view.attachments).toEqual([]);
  });
});

describe('isBugReportStoragePath', () => {
  it('erkennt Pfade mit und ohne führenden Schrägstrich', () => {
    expect(isBugReportStoragePath('r1', 'bugReports/r1/a.png')).toBe(true);
    expect(isBugReportStoragePath('r1', '/bugReports/r1/a.png')).toBe(true);
    expect(isBugReportStoragePath('r1', 'bugReports/r1/')).toBe(false);
    expect(isBugReportStoragePath('r1', 'bugReports/r10/a.png')).toBe(false);
    expect(isBugReportStoragePath('', 'bugReports//a.png')).toBe(false);
  });
});

describe('bugReportTimeValue', () => {
  it('liest ISO-Zeichenketten, Dates und Timestamps', () => {
    expect(bugReportTimeValue('2026-01-01T00:00:00.000Z')).toBe(
      Date.UTC(2026, 0, 1),
    );
    expect(bugReportTimeValue(new Date(5))).toBe(5);
    expect(bugReportTimeValue({ seconds: 2 })).toBe(2000);
    expect(bugReportTimeValue(undefined)).toBe(0);
  });
});
