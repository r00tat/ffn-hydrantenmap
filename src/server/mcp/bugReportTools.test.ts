import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const service = vi.hoisted(() => ({
  listBugReports: vi.fn(),
  getBugReport: vi.fn(),
  listBugReportComments: vi.fn(),
  readStorageImage: vi.fn(),
  updateBugReport: vi.fn(),
  addBugReportComment: vi.fn(),
}));
vi.mock('../bugReport/bugReportService', () => service);

const {
  addBugReportCommentViaMcp,
  getBugReportForUser,
  listBugReportsForUser,
  MAX_SCREENSHOTS,
  updateBugReportViaMcp,
} = await import('./bugReportTools');
import type { McpUser } from './userAccess';

const member: McpUser = {
  uid: 'u1',
  isAdmin: false,
  groups: ['allUsers'],
  groupRoles: {},
  email: 'melder@example.org',
};
const admin: McpUser = {
  uid: 'a1',
  isAdmin: true,
  groups: ['allUsers'],
  groupRoles: {},
  email: 'admin@example.org',
  displayName: 'Erika Beispiel',
};

const report = {
  id: 'r1',
  kind: 'bug',
  title: 'T',
  description: 'D',
  status: 'open',
  createdAt: '2026-11-01T00:00:00.000Z',
  createdBy: { uid: 'u1', email: 'melder@example.org' },
  context: { database: '', url: 'https://x/intern' },
  logs: [{ message: 'log-geheim' }],
  internalNote: 'notiz-geheim',
  assignee: 'Max Muster',
  screenshots: ['bugReports/r1/a.png', 'groups/x/fremd.png'],
  attachments: [],
};

const comments = [
  {
    id: 'c1',
    entryType: 'comment',
    text: 'kommentar-intern',
    visibility: 'internal',
    createdAt: '2026-11-01T01:00:00.000Z',
    createdBy: { uid: 'a1', email: 'admin@example.org' },
  },
  {
    id: 'c2',
    entryType: 'comment',
    text: 'für dich',
    visibility: 'reporter',
    createdAt: '2026-11-01T02:00:00.000Z',
    createdBy: { uid: 'a1', email: 'admin@example.org' },
  },
];

function text(result: { content: Array<{ type: string; text?: string }> }) {
  return result.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
}

beforeEach(() => {
  vi.clearAllMocks();
  service.listBugReports.mockResolvedValue([report]);
  service.getBugReport.mockResolvedValue(report);
  service.listBugReportComments.mockResolvedValue(comments);
  service.readStorageImage.mockResolvedValue({
    ok: true,
    data: 'AAAA',
    mimeType: 'image/png',
    size: 3,
  });
  service.updateBugReport.mockResolvedValue({ changes: [] });
  service.addBugReportComment.mockResolvedValue({ commentId: 'c9' });
});

describe('list_bug_reports', () => {
  it('beschränkt Nicht-Admins auf die eigenen Reports, auch ohne onlyMine', async () => {
    const result = await listBugReportsForUser(member, { onlyMine: false });
    expect(service.listBugReports).toHaveBeenCalledWith(
      expect.objectContaining({ createdByUid: 'u1' }),
    );
    expect(text(result)).not.toContain('notiz-geheim');
    expect(text(result)).not.toContain('Max Muster');
  });

  it('zeigt Admins alle Reports samt internen Feldern', async () => {
    const result = await listBugReportsForUser(admin, { status: 'open' });
    const call = service.listBugReports.mock.calls[0][0];
    expect(call.createdByUid).toBeUndefined();
    expect(call.status).toBe('open');
    expect(text(result)).toContain('Max Muster');
  });

  it('beschränkt Admins mit onlyMine auf ihre eigenen', async () => {
    await listBugReportsForUser(admin, { onlyMine: true });
    expect(service.listBugReports).toHaveBeenCalledWith(
      expect.objectContaining({ createdByUid: 'a1' }),
    );
  });
});

describe('get_bug_report', () => {
  it('liefert dem Melder nur die Melder-Ansicht seines Reports', async () => {
    const result = await getBugReportForUser(member, { id: 'r1' });
    expect(result.isError).toBeFalsy();
    const out = text(result);
    expect(out).toContain('für dich');
    for (const secret of [
      'kommentar-intern',
      'notiz-geheim',
      'log-geheim',
      'Max Muster',
      'https://x/intern',
      'admin@example.org',
    ]) {
      expect(out).not.toContain(secret);
    }
  });

  it('verweigert einem Nicht-Admin einen fremden Report wie einen fehlenden', async () => {
    service.getBugReport.mockResolvedValue({
      ...report,
      createdBy: { uid: 'u2', email: 'x@y' },
    });
    const result = await getBugReportForUser(member, { id: 'r1' });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/nicht gefunden/);
    expect(service.listBugReportComments).not.toHaveBeenCalled();
  });

  it('liefert Admins den ganzen Report und Verlauf', async () => {
    service.getBugReport.mockResolvedValue({
      ...report,
      createdBy: { uid: 'u2', email: 'x@y' },
    });
    const out = text(await getBugReportForUser(admin, { id: 'r1' }));
    expect(out).toContain('kommentar-intern');
    expect(out).toContain('log-geheim');
  });

  it('hängt nur Screenshots aus dem Ordner des Reports als Bild an', async () => {
    const result = await getBugReportForUser(member, {
      id: 'r1',
      includeScreenshots: true,
    });
    expect(service.readStorageImage).toHaveBeenCalledTimes(1);
    expect(service.readStorageImage.mock.calls[0][0]).toBe(
      'bugReports/r1/a.png',
    );
    expect(result.content).toContainEqual({
      type: 'image',
      data: 'AAAA',
      mimeType: 'image/png',
    });
  });

  it('begrenzt die Zahl der Screenshots und meldet zu große', async () => {
    service.getBugReport.mockResolvedValue({
      ...report,
      screenshots: Array.from(
        { length: MAX_SCREENSHOTS + 2 },
        (_, i) => `bugReports/r1/${i}.png`,
      ),
    });
    service.readStorageImage.mockResolvedValueOnce({
      ok: false,
      reason: 'too large',
    });
    const result = await getBugReportForUser(admin, {
      id: 'r1',
      includeScreenshots: true,
    });
    expect(service.readStorageImage).toHaveBeenCalledTimes(MAX_SCREENSHOTS);
    expect(text(result)).toContain('too large');
    expect(text(result)).toContain('2 weitere Screenshots');
  });
});

describe('update_bug_report', () => {
  const ctx = { user: admin, clientId: 'mcp_1', clientName: 'Claude' };

  it('verweigert Nicht-Admins auch beim Aufruf', async () => {
    const result = await updateBugReportViaMcp(
      { ...ctx, user: member },
      { id: 'r1', status: 'closed' },
    );
    expect(result.isError).toBe(true);
    expect(service.updateBugReport).not.toHaveBeenCalled();
  });

  it('schreibt mit Bearbeiter, MCP-Herkunft und Benachrichtigungswunsch', async () => {
    service.updateBugReport.mockResolvedValue({
      changes: [{ field: 'status', from: 'open', to: 'closed' }],
      notification: { status: 'sent', to: 'melder@example.org' },
    });
    const result = await updateBugReportViaMcp(ctx, {
      id: 'r1',
      status: 'closed',
      resolution: 'Behoben',
      notifyReporter: true,
    });
    expect(service.updateBugReport).toHaveBeenCalledWith(
      'r1',
      { status: 'closed', resolution: 'Behoben' },
      {
        uid: 'a1',
        email: 'admin@example.org',
        displayName: 'Erika Beispiel',
      },
      {
        origin: { source: 'mcp', clientId: 'mcp_1', clientName: 'Claude' },
        notifyReporter: true,
      },
    );
    expect(text(result)).toContain('"status": "sent"');
  });

  it('meldet einen fehlenden Report', async () => {
    service.getBugReport.mockResolvedValue(undefined);
    const result = await updateBugReportViaMcp(ctx, { id: 'nope' });
    expect(result.isError).toBe(true);
    expect(service.updateBugReport).not.toHaveBeenCalled();
  });

  it('gibt Prüffehler als Tool-Fehler zurück', async () => {
    service.updateBugReport.mockRejectedValue(new Error('GitHub-Issue: kaputt'));
    const result = await updateBugReportViaMcp(ctx, {
      id: 'r1',
      githubIssue: 'kaputt',
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('GitHub-Issue');
  });
});

describe('add_bug_report_comment', () => {
  const ctx = { user: admin, clientId: 'mcp_1' };

  it('verweigert Nicht-Admins', async () => {
    const result = await addBugReportCommentViaMcp(
      { ...ctx, user: member },
      { id: 'r1', text: 'x' },
    );
    expect(result.isError).toBe(true);
    expect(service.addBugReportComment).not.toHaveBeenCalled();
  });

  it('schreibt standardmäßig intern und mit MCP-Herkunft', async () => {
    await addBugReportCommentViaMcp(ctx, { id: 'r1', text: 'geprüft' });
    expect(service.addBugReportComment).toHaveBeenCalledWith(
      'r1',
      'geprüft',
      expect.objectContaining({ uid: 'a1' }),
      {
        visibility: 'internal',
        origin: { source: 'mcp', clientId: 'mcp_1' },
        notifyReporter: false,
      },
    );
  });

  it('reicht einen Melder-Kommentar samt Benachrichtigung durch', async () => {
    await addBugReportCommentViaMcp(ctx, {
      id: 'r1',
      text: 'behoben',
      visibility: 'reporter',
      notifyReporter: true,
    });
    expect(service.addBugReportComment.mock.calls[0][3]).toMatchObject({
      visibility: 'reporter',
      notifyReporter: true,
    });
  });
});
