import { describe, expect, it } from 'vitest';
import {
  BUG_REPORT_GITHUB_REPO,
  buildBugReportIssueDraftUrl,
  computeBugReportChanges,
  normalizeBugReportUpdate,
  parseBugReportIssueRef,
} from './bugReportTracking';
import {
  BUG_REPORT_COMMENT_MAX_LENGTH,
  BUG_REPORT_SHORT_FIELD_MAX_LENGTH,
  type BugReport,
} from './bugReport';

describe('parseBugReportIssueRef', () => {
  it('returns null for empty input', () => {
    expect(parseBugReportIssueRef(undefined)).toBeNull();
    expect(parseBugReportIssueRef(null)).toBeNull();
    expect(parseBugReportIssueRef('   ')).toBeNull();
  });

  it('accepts a bare issue number', () => {
    expect(parseBugReportIssueRef('704')).toEqual({
      label: '#704',
      url: `https://github.com/${BUG_REPORT_GITHUB_REPO}/issues/704`,
      number: 704,
      repo: BUG_REPORT_GITHUB_REPO,
    });
  });

  it('accepts a number with leading hash and whitespace', () => {
    expect(parseBugReportIssueRef('  #704 ')?.number).toBe(704);
  });

  it('rejects non-positive numbers', () => {
    expect(parseBugReportIssueRef('0')).toBeNull();
    expect(parseBugReportIssueRef('-5')).toBeNull();
  });

  it('labels an issue of the own repository with the plain number', () => {
    const ref = parseBugReportIssueRef(
      `https://github.com/${BUG_REPORT_GITHUB_REPO}/issues/704`,
    );
    expect(ref).toMatchObject({ label: '#704', number: 704 });
  });

  it('keeps the repository in the label for a foreign repository', () => {
    const ref = parseBugReportIssueRef(
      'https://github.com/other/repo/issues/7',
    );
    expect(ref).toMatchObject({
      label: 'other/repo#7',
      number: 7,
      repo: 'other/repo',
    });
  });

  it('accepts pull request urls and urls with a fragment', () => {
    expect(
      parseBugReportIssueRef(
        `https://github.com/${BUG_REPORT_GITHUB_REPO}/pull/12`,
      )?.number,
    ).toBe(12);
    expect(
      parseBugReportIssueRef(
        `https://github.com/${BUG_REPORT_GITHUB_REPO}/issues/704#issuecomment-1`,
      )?.number,
    ).toBe(704);
  });

  it('keeps a foreign tracker url as-is', () => {
    const ref = parseBugReportIssueRef('https://git.example/x/-/issues/3');
    expect(ref).toEqual({
      label: 'https://git.example/x/-/issues/3',
      url: 'https://git.example/x/-/issues/3',
    });
  });

  it('rejects free text and non-http urls', () => {
    expect(parseBugReportIssueRef('irgendwas')).toBeNull();
    expect(parseBugReportIssueRef('javascript:alert(1)')).toBeNull();
  });
});

describe('buildBugReportIssueDraftUrl', () => {
  const report = {
    id: 'r1',
    kind: 'bug',
    title: 'Karte lädt nicht',
    description: 'Nach dem Login bleibt die Karte leer.',
    status: 'open',
    createdAt: '2026-08-20T10:00:00.000Z',
    createdBy: { uid: 'u1', email: 'melder@x' },
    context: {
      url: 'https://app.example/map',
      pathname: '/map',
      buildId: 'build-1',
      database: 'ffndev',
      userAgent: 'UA',
      platform: 'android',
      isNative: true,
      viewport: { width: 400, height: 800 },
      locale: 'de',
    },
    logs: [],
    screenshots: [],
    attachments: [],
  } as unknown as BugReport;

  it('prefills title, label and body of a new issue', () => {
    const url = new URL(buildBugReportIssueDraftUrl(report));
    expect(url.origin + url.pathname).toBe(
      `https://github.com/${BUG_REPORT_GITHUB_REPO}/issues/new`,
    );
    expect(url.searchParams.get('title')).toBe('Karte lädt nicht');
    expect(url.searchParams.get('labels')).toBe('bug');
    const body = url.searchParams.get('body') ?? '';
    expect(body).toContain('Nach dem Login bleibt die Karte leer.');
    expect(body).toContain('https://app.example/map');
    expect(body).toContain('build-1');
    expect(body).toContain('ffndev');
    expect(body).toContain('r1');
  });

  it('uses the feature label for a feature request', () => {
    const url = new URL(
      buildBugReportIssueDraftUrl({ ...report, kind: 'feature' }),
    );
    expect(url.searchParams.get('labels')).toBe('feature');
  });
});

describe('normalizeBugReportUpdate', () => {
  it('trims values and normalizes the issue reference to a url', () => {
    expect(
      normalizeBugReportUpdate({
        githubIssue: ' #704 ',
        assignee: ' Paul ',
        internalNote: ' Notiz ',
      }),
    ).toEqual({
      githubIssue: `https://github.com/${BUG_REPORT_GITHUB_REPO}/issues/704`,
      assignee: 'Paul',
      internalNote: 'Notiz',
    });
  });

  it('turns cleared fields into empty strings', () => {
    expect(
      normalizeBugReportUpdate({
        githubIssue: '',
        assignee: '   ',
        internalNote: '',
      }),
    ).toEqual({ githubIssue: '', assignee: '', internalNote: '' });
  });

  it('keeps untouched fields out of the result', () => {
    expect(normalizeBugReportUpdate({ assignee: 'Paul' })).toEqual({
      assignee: 'Paul',
    });
  });

  it('passes a valid status through and rejects an unknown one', () => {
    expect(normalizeBugReportUpdate({ status: 'closed' })).toEqual({
      status: 'closed',
    });
    expect(() =>
      normalizeBugReportUpdate({
        status: 'erledigt' as never,
      }),
    ).toThrow(/status/i);
  });

  it('rejects an unparsable issue reference', () => {
    expect(() => normalizeBugReportUpdate({ githubIssue: 'irgendwas' })).toThrow(
      /github/i,
    );
  });

  it('rejects overlong values', () => {
    expect(() =>
      normalizeBugReportUpdate({
        assignee: 'x'.repeat(BUG_REPORT_SHORT_FIELD_MAX_LENGTH + 1),
      }),
    ).toThrow(/lang/i);
    expect(() =>
      normalizeBugReportUpdate({
        internalNote: 'x'.repeat(BUG_REPORT_COMMENT_MAX_LENGTH + 1),
      }),
    ).toThrow(/lang/i);
  });
});

describe('computeBugReportChanges', () => {
  const before = {
    status: 'open',
    githubIssue: 'https://github.com/r00tat/ffn-hydrantenmap/issues/1',
  } as unknown as BugReport;

  it('lists only fields that actually changed', () => {
    expect(
      computeBugReportChanges(before, {
        status: 'in_progress',
        githubIssue: 'https://github.com/r00tat/ffn-hydrantenmap/issues/1',
        assignee: 'Paul',
      }),
    ).toEqual([
      { field: 'status', from: 'open', to: 'in_progress' },
      { field: 'assignee', from: '', to: 'Paul' },
    ]);
  });

  it('records a cleared field', () => {
    expect(computeBugReportChanges(before, { githubIssue: '' })).toEqual([
      {
        field: 'githubIssue',
        from: 'https://github.com/r00tat/ffn-hydrantenmap/issues/1',
        to: '',
      },
    ]);
  });

  it('returns an empty list when nothing changed', () => {
    expect(computeBugReportChanges(before, { status: 'open' })).toEqual([]);
  });
});
