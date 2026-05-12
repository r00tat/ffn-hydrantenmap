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

vi.mock('../../../server/firebase/admin', () => ({
  firestore: {
    collection: (...args: unknown[]) => mockCollection(...args),
  },
  getAdminStorage: () => ({
    bucket: () => ({
      file: (path: string) => ({
        getSignedUrl: vi
          .fn()
          .mockResolvedValue([`https://signed.example/${path}`]),
      }),
    }),
  }),
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => 'SERVER_TS' },
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
  updateBugReportStatusAction,
  getBugReportConfigAction,
  updateBugReportConfigAction,
} from './bugReportAdminActions';
import {
  APP_CONFIG_COLLECTION,
  BUG_REPORT_COLLECTION,
  BUG_REPORT_CONFIG_DOC,
  DEFAULT_BUG_REPORT_CONFIG,
} from '../../../common/bugReport';

function wireCollectionDoc() {
  const docHandle = {
    set: mockSet,
    update: mockUpdate,
    get: mockGet,
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
