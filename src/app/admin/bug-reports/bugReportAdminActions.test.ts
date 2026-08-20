import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

// ----- firestore mock plumbing -----
const mockSet = vi.fn().mockResolvedValue(undefined);
const mockUpdate = vi.fn().mockResolvedValue(undefined);
const mockGet = vi.fn();
const mockLimit = vi.fn();
const mockOrderBy = vi.fn();
const mockDoc = vi.fn();
const mockCollection = vi.fn();
const mockDocCollection = vi.fn();
const mockCommentAdd = vi.fn().mockResolvedValue({ id: 'c1' });
const mockCommentsGet = vi.fn();
const mockCommentsOrderBy = vi.fn();

vi.mock('../../../server/firebase/admin', () => ({
  firestore: {
    collection: (...args: unknown[]) => mockCollection(...args),
  },
  getAdminStorage: () => ({
    bucket: (_name?: string) => ({
      file: (path: string) => ({
        getSignedUrl: vi
          .fn()
          .mockResolvedValue([`https://signed.example/${path}`]),
      }),
    }),
  }),
}));

vi.mock('../../../server/firebase/project', () => ({
  getGcpProjectId: () => Promise.resolve('ffn-utils'),
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => 'SERVER_TS',
    delete: () => 'DELETE_FIELD',
  },
  Timestamp: class {
    constructor(
      public seconds: number,
      public nanoseconds: number,
    ) {}
    toDate(): Date {
      return new Date(this.seconds * 1000 + this.nanoseconds / 1e6);
    }
  },
}));

const actionAdminRequiredMock = vi.fn();
vi.mock('../../auth', () => ({
  actionAdminRequired: () => actionAdminRequiredMock(),
}));

import {
  listBugReportsAction,
  getBugReportAction,
  updateBugReportAction,
  updateBugReportStatusAction,
  listBugReportCommentsAction,
  addBugReportCommentAction,
  getBugReportConfigAction,
  updateBugReportConfigAction,
} from './bugReportAdminActions';
import {
  APP_CONFIG_COLLECTION,
  BUG_REPORT_COLLECTION,
  BUG_REPORT_COMMENT_MAX_LENGTH,
  BUG_REPORT_COMMENTS_COLLECTION,
  BUG_REPORT_CONFIG_DOC,
  DEFAULT_BUG_REPORT_CONFIG,
} from '../../../common/bugReport';

function wireCollectionDoc() {
  const commentsHandle = {
    add: mockCommentAdd,
    orderBy: (...args: unknown[]) => {
      mockCommentsOrderBy(...args);
      return { get: mockCommentsGet };
    },
  };
  const docHandle = {
    set: mockSet,
    update: mockUpdate,
    get: mockGet,
    collection: (...args: unknown[]) => {
      mockDocCollection(...args);
      return commentsHandle;
    },
  };
  mockDoc.mockReturnValue(docHandle);
  mockLimit.mockReturnValue({ get: mockGet });
  mockOrderBy.mockReturnValue({ limit: mockLimit });
  mockCollection.mockReturnValue({
    doc: mockDoc,
    orderBy: mockOrderBy,
  });
  return docHandle;
}

const adminSession = {
  user: { id: 'admin1', email: 'admin@x', name: 'Admin One' },
};

describe('bugReportAdminActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionAdminRequiredMock.mockResolvedValue(adminSession);
    mockCommentAdd.mockResolvedValue({ id: 'c1' });
    mockCommentsGet.mockResolvedValue({ docs: [] });
    wireCollectionDoc();
  });

  describe('listBugReportsAction', () => {
    it('calls actionAdminRequired and returns ordered reports', async () => {
      mockGet.mockResolvedValueOnce({
        docs: [
          { id: 'r1', data: () => ({ title: 'A', status: 'open' }) },
          { id: 'r2', data: () => ({ title: 'B', status: 'closed' }) },
        ],
      });
      const reports = await listBugReportsAction();
      expect(actionAdminRequiredMock).toHaveBeenCalled();
      expect(mockCollection).toHaveBeenCalledWith(BUG_REPORT_COLLECTION);
      expect(mockOrderBy).toHaveBeenCalledWith('createdAt', 'desc');
      expect(mockLimit).toHaveBeenCalledWith(500);
      expect(reports).toHaveLength(2);
      expect(reports[0]).toMatchObject({ id: 'r1', title: 'A' });
    });
  });

  describe('getBugReportAction', () => {
    it('calls actionAdminRequired and returns report with signed URLs', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        id: 'r1',
        data: () => ({
          title: 'T',
          screenshots: ['bugReports/r1/a.png'],
          attachments: ['bugReports/r1/b.pdf'],
        }),
      });
      const result = await getBugReportAction('r1');
      expect(actionAdminRequiredMock).toHaveBeenCalled();
      expect(mockCollection).toHaveBeenCalledWith(BUG_REPORT_COLLECTION);
      expect(mockDoc).toHaveBeenCalledWith('r1');
      expect(result.report.id).toBe('r1');
      expect(result.screenshotUrls).toHaveLength(1);
      expect(result.screenshotUrls[0]).toMatch(/^https:\/\/signed\.example\//);
      expect(result.attachmentUrls).toHaveLength(1);
    });

    it('returns the comment history along with the report', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        id: 'r1',
        data: () => ({ title: 'T' }),
      });
      mockCommentsGet.mockResolvedValueOnce({
        docs: [
          {
            id: 'c1',
            data: () => ({ entryType: 'comment', text: 'geprüft' }),
          },
        ],
      });
      const result = await getBugReportAction('r1');
      expect(mockDocCollection).toHaveBeenCalledWith(
        BUG_REPORT_COMMENTS_COLLECTION,
      );
      expect(mockCommentsOrderBy).toHaveBeenCalledWith('createdAt', 'asc');
      expect(result.comments).toEqual([
        { id: 'c1', entryType: 'comment', text: 'geprüft' },
      ]);
    });

    it('throws when report does not exist', async () => {
      mockGet.mockResolvedValueOnce({ exists: false });
      await expect(getBugReportAction('missing')).rejects.toThrow(
        /not found/i,
      );
      expect(actionAdminRequiredMock).toHaveBeenCalled();
    });
  });

  describe('updateBugReportStatusAction', () => {
    it('calls actionAdminRequired and updates with server timestamp + updatedBy', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        id: 'r1',
        data: () => ({ status: 'open' }),
      });
      await updateBugReportStatusAction('r1', 'closed');
      expect(actionAdminRequiredMock).toHaveBeenCalled();
      expect(mockCollection).toHaveBeenCalledWith(BUG_REPORT_COLLECTION);
      expect(mockDoc).toHaveBeenCalledWith('r1');
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      const payload = mockUpdate.mock.calls[0][0];
      expect(payload.status).toBe('closed');
      expect(payload.updatedAt).toBe('SERVER_TS');
      expect(payload.updatedBy).toEqual({
        uid: 'admin1',
        email: 'admin@x',
        displayName: 'Admin One',
      });
    });

    it('records the status change in the history', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        id: 'r1',
        data: () => ({ status: 'open' }),
      });
      await updateBugReportStatusAction('r1', 'in_progress');
      expect(mockCommentAdd).toHaveBeenCalledTimes(1);
      const entry = mockCommentAdd.mock.calls[0][0];
      expect(entry.entryType).toBe('change');
      expect(entry.changes).toEqual([
        { field: 'status', from: 'open', to: 'in_progress' },
      ]);
    });
  });

  describe('updateBugReportAction', () => {
    function wireExisting(data: Record<string, unknown>) {
      mockGet.mockResolvedValueOnce({ exists: true, id: 'r1', data: () => data });
    }

    it('normalizes the fields and writes them with updatedAt/updatedBy', async () => {
      wireExisting({ status: 'open' });
      await updateBugReportAction('r1', {
        githubIssue: '#704',
        assignee: '  Paul  ',
        internalNote: 'liegt am Index',
      });
      expect(actionAdminRequiredMock).toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      const payload = mockUpdate.mock.calls[0][0];
      expect(payload.githubIssue).toBe(
        'https://github.com/r00tat/ffn-hydrantenmap/issues/704',
      );
      expect(payload.assignee).toBe('Paul');
      expect(payload.internalNote).toBe('liegt am Index');
      expect(payload.updatedAt).toBe('SERVER_TS');
      expect(payload.updatedBy).toMatchObject({ uid: 'admin1' });
    });

    it('removes a cleared field from the document', async () => {
      wireExisting({ status: 'open', assignee: 'Paul' });
      await updateBugReportAction('r1', { assignee: '' });
      const payload = mockUpdate.mock.calls[0][0];
      expect(payload.assignee).toBe('DELETE_FIELD');
    });

    it('writes a single history entry listing every change', async () => {
      wireExisting({ status: 'open', assignee: 'Paul' });
      await updateBugReportAction('r1', {
        status: 'in_progress',
        assignee: 'Anna',
      });
      expect(mockCommentAdd).toHaveBeenCalledTimes(1);
      expect(mockDocCollection).toHaveBeenCalledWith(
        BUG_REPORT_COMMENTS_COLLECTION,
      );
      const entry = mockCommentAdd.mock.calls[0][0];
      expect(entry.entryType).toBe('change');
      expect(entry.visibility).toBe('internal');
      expect(entry.createdAt).toBe('SERVER_TS');
      expect(entry.createdBy).toMatchObject({ uid: 'admin1' });
      expect(entry.changes).toEqual([
        { field: 'status', from: 'open', to: 'in_progress' },
        { field: 'assignee', from: 'Paul', to: 'Anna' },
      ]);
    });

    it('writes nothing when no value actually changed', async () => {
      wireExisting({ status: 'open', assignee: 'Paul' });
      await updateBugReportAction('r1', { status: 'open', assignee: 'Paul' });
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockCommentAdd).not.toHaveBeenCalled();
    });

    it('rejects an invalid issue reference before writing', async () => {
      await expect(
        updateBugReportAction('r1', { githubIssue: 'irgendwas' }),
      ).rejects.toThrow(/github/i);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('throws when the report does not exist', async () => {
      mockGet.mockResolvedValueOnce({ exists: false });
      await expect(
        updateBugReportAction('missing', { assignee: 'Paul' }),
      ).rejects.toThrow(/not found/i);
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  describe('listBugReportCommentsAction', () => {
    it('returns the entries in chronological order', async () => {
      mockCommentsGet.mockResolvedValueOnce({
        docs: [
          {
            id: 'c1',
            data: () => ({ entryType: 'comment', text: 'geprüft' }),
          },
        ],
      });
      const comments = await listBugReportCommentsAction('r1');
      expect(actionAdminRequiredMock).toHaveBeenCalled();
      expect(mockDocCollection).toHaveBeenCalledWith(
        BUG_REPORT_COMMENTS_COLLECTION,
      );
      expect(mockCommentsOrderBy).toHaveBeenCalledWith('createdAt', 'asc');
      expect(comments).toEqual([
        { id: 'c1', entryType: 'comment', text: 'geprüft' },
      ]);
    });
  });

  describe('addBugReportCommentAction', () => {
    it('writes a trimmed internal comment with author and timestamp', async () => {
      await addBugReportCommentAction('r1', '  nicht reproduzierbar  ');
      expect(actionAdminRequiredMock).toHaveBeenCalled();
      expect(mockCommentAdd).toHaveBeenCalledTimes(1);
      const entry = mockCommentAdd.mock.calls[0][0];
      expect(entry).toMatchObject({
        entryType: 'comment',
        text: 'nicht reproduzierbar',
        visibility: 'internal',
        createdAt: 'SERVER_TS',
        createdBy: { uid: 'admin1', email: 'admin@x' },
      });
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('rejects an empty comment', async () => {
      await expect(addBugReportCommentAction('r1', '   ')).rejects.toThrow(
        /leer/i,
      );
      expect(mockCommentAdd).not.toHaveBeenCalled();
    });

    it('rejects an overlong comment', async () => {
      await expect(
        addBugReportCommentAction(
          'r1',
          'x'.repeat(BUG_REPORT_COMMENT_MAX_LENGTH + 1),
        ),
      ).rejects.toThrow(/lang/i);
      expect(mockCommentAdd).not.toHaveBeenCalled();
    });
  });

  describe('getBugReportConfigAction', () => {
    it('calls actionAdminRequired and returns default when doc missing', async () => {
      mockGet.mockResolvedValueOnce({ exists: false });
      const cfg = await getBugReportConfigAction();
      expect(actionAdminRequiredMock).toHaveBeenCalled();
      expect(mockCollection).toHaveBeenCalledWith(APP_CONFIG_COLLECTION);
      expect(mockDoc).toHaveBeenCalledWith(BUG_REPORT_CONFIG_DOC);
      expect(cfg).toEqual(DEFAULT_BUG_REPORT_CONFIG);
    });

    it('returns stored config when present', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          recipientEmails: ['a@x', 'b@x'],
          enabled: false,
        }),
      });
      const cfg = await getBugReportConfigAction();
      expect(cfg.recipientEmails).toEqual(['a@x', 'b@x']);
      expect(cfg.enabled).toBe(false);
    });
  });

  describe('updateBugReportConfigAction', () => {
    it('calls actionAdminRequired and writes config with merge', async () => {
      await updateBugReportConfigAction({
        recipientEmails: ['x@y'],
        enabled: true,
      });
      expect(actionAdminRequiredMock).toHaveBeenCalled();
      expect(mockCollection).toHaveBeenCalledWith(APP_CONFIG_COLLECTION);
      expect(mockDoc).toHaveBeenCalledWith(BUG_REPORT_CONFIG_DOC);
      expect(mockSet).toHaveBeenCalledTimes(1);
      const [payload, options] = mockSet.mock.calls[0];
      expect(payload.recipientEmails).toEqual(['x@y']);
      expect(payload.enabled).toBe(true);
      expect(payload.updatedAt).toBe('SERVER_TS');
      expect(payload.updatedBy).toEqual({
        uid: 'admin1',
        email: 'admin@x',
        displayName: 'Admin One',
      });
      expect(options).toEqual({ merge: true });
    });

    it('coerces missing values to safe defaults', async () => {
      await updateBugReportConfigAction({
        recipientEmails: undefined as unknown as string[],
        enabled: undefined as unknown as boolean,
      });
      const [payload] = mockSet.mock.calls[0];
      expect(payload.recipientEmails).toEqual([]);
      expect(payload.enabled).toBe(false);
    });
  });
});
