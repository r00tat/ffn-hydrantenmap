import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { buildBugReportEmail } from './buildBugReportEmail';
import type { BugReport } from '../../common/bugReport';

const baseReport: BugReport = {
  id: 'r1',
  kind: 'bug',
  title: 'Karte lädt nicht',
  description: 'Beim Öffnen…',
  status: 'open',
  createdAt: '2026-05-11T10:00:00.000Z',
  createdBy: { uid: 'u1', email: 'max@ff-neusiedlamsee.at', displayName: 'Max' },
  context: {
    url: 'https://app/x',
    pathname: '/x',
    buildId: 'b1',
    database: '',
    userAgent: 'UA',
    platform: 'web',
    isNative: false,
    firecallId: 'fc1',
    firecallName: 'Einsatz 1',
    viewport: { width: 100, height: 100 },
    locale: 'de-AT',
  },
  logs: [],
  screenshots: [],
  attachments: [],
};

describe('buildBugReportEmail', () => {
  it('prefixes subject with [Bug] for bug kind', () => {
    const { subject } = buildBugReportEmail({
      report: baseReport,
      appBaseUrl: 'https://app',
      from: 'noreply@x',
      to: 'admin@x',
    });
    expect(subject).toMatch(/^\[Bug\] Karte lädt nicht/);
    expect(subject).toContain('max@ff-neusiedlamsee.at');
  });

  it('prefixes subject with [Feature] for feature kind', () => {
    const { subject } = buildBugReportEmail({
      report: { ...baseReport, kind: 'feature' },
      appBaseUrl: 'https://app',
      from: 'noreply@x',
      to: 'admin@x',
    });
    expect(subject).toMatch(/^\[Feature\]/);
  });

  it('includes a direct link and firecall name in body', () => {
    const { body } = buildBugReportEmail({
      report: baseReport,
      appBaseUrl: 'https://app',
      from: 'noreply@x',
      to: 'admin@x',
    });
    expect(body).toContain('https://app/admin/bug-reports/r1');
    expect(body).toContain('Einsatz 1');
  });

  it('produces an RFC-2822 raw message with UTF-8 subject', () => {
    const { raw } = buildBugReportEmail({
      report: baseReport,
      appBaseUrl: 'https://app',
      from: 'noreply@x',
      to: 'admin@x',
    });
    expect(raw).toContain('From: noreply@x');
    expect(raw).toContain('To: admin@x');
    expect(raw).toMatch(/Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/);
    expect(raw).toContain('Content-Type: text/plain; charset="UTF-8"');
  });
});
