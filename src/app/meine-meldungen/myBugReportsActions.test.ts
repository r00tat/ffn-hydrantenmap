import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const actionUserRequiredMock = vi.fn();
vi.mock('../auth', () => ({
  actionUserRequired: () => actionUserRequiredMock(),
}));

const listBugReportsMock = vi.fn();
const listBugReportCommentsMock = vi.fn();
const getBugReportMock = vi.fn();
const signStoragePathsMock = vi.fn();
vi.mock('../../server/bugReport/bugReportService', () => ({
  listBugReports: (...a: unknown[]) => listBugReportsMock(...a),
  listBugReportComments: (...a: unknown[]) => listBugReportCommentsMock(...a),
  getBugReport: (...a: unknown[]) => getBugReportMock(...a),
  signStoragePaths: (paths: string[]) => signStoragePathsMock(paths),
}));

const { listMyBugReportsAction, getMyBugReportFilesAction } = await import(
  './myBugReportsActions'
);

const ownReport = {
  id: 'r1',
  kind: 'bug',
  title: 'T',
  description: 'D',
  status: 'open',
  createdAt: '2026-11-01T00:00:00.000Z',
  createdBy: { uid: 'u1', email: 'melder@example.org' },
  internalNote: 'geheim',
  screenshots: ['bugReports/r1/a.png', 'groups/x/fremd.pdf'],
  attachments: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  actionUserRequiredMock.mockResolvedValue({ user: { id: 'u1' } });
  signStoragePathsMock.mockImplementation(async (paths: string[]) =>
    paths.map((p) => `https://signed/${p}`),
  );
});

describe('listMyBugReportsAction', () => {
  it('fragt nur die Reports des angemeldeten Benutzers ab und projiziert sie', async () => {
    listBugReportsMock.mockResolvedValue([ownReport]);
    listBugReportCommentsMock.mockResolvedValue([
      {
        id: 'c1',
        entryType: 'comment',
        text: 'intern',
        visibility: 'internal',
        createdBy: { uid: 'a', email: 'a@x' },
      },
    ]);
    const views = await listMyBugReportsAction();
    expect(actionUserRequiredMock).toHaveBeenCalled();
    expect(listBugReportsMock).toHaveBeenCalledWith(
      expect.objectContaining({ createdByUid: 'u1' }),
    );
    expect(views).toHaveLength(1);
    expect(views[0].entries).toEqual([]);
    expect(JSON.stringify(views)).not.toContain('geheim');
  });

  it('scheitert ohne Anmeldung', async () => {
    actionUserRequiredMock.mockRejectedValue(new Error('not authorized'));
    await expect(listMyBugReportsAction()).rejects.toThrow();
    expect(listBugReportsMock).not.toHaveBeenCalled();
  });
});

describe('getMyBugReportFilesAction', () => {
  it('signiert nur Pfade im Ordner des eigenen Reports', async () => {
    getBugReportMock.mockResolvedValue(ownReport);
    const files = await getMyBugReportFilesAction('r1');
    expect(signStoragePathsMock).toHaveBeenCalledWith(['bugReports/r1/a.png']);
    expect(files.screenshotUrls).toEqual(['https://signed/bugReports/r1/a.png']);
  });

  it('verweigert einen fremden Report', async () => {
    getBugReportMock.mockResolvedValue({
      ...ownReport,
      createdBy: { uid: 'u2', email: 'x@y' },
    });
    await expect(getMyBugReportFilesAction('r1')).rejects.toThrow(
      /nicht gefunden/,
    );
    expect(signStoragePathsMock).not.toHaveBeenCalled();
  });

  it('verweigert einen fehlenden Report', async () => {
    getBugReportMock.mockResolvedValue(undefined);
    await expect(getMyBugReportFilesAction('nope')).rejects.toThrow(
      /nicht gefunden/,
    );
  });
});
