import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const mockSet = vi.fn().mockResolvedValue(undefined);
const mockGet = vi.fn();
const mockUpdate = vi.fn().mockResolvedValue(undefined);
const mockDoc = vi.fn(() => ({ set: mockSet, get: mockGet, update: mockUpdate }));
const mockCollection = vi.fn((..._args: unknown[]) => ({ doc: mockDoc }));

vi.mock('../../server/firebase/admin', () => ({
  firestore: {
    collection: (...args: unknown[]) => mockCollection(...args),
  },
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => 'SERVER_TS' },
}));

const actionUserRequiredMock = vi.fn();
vi.mock('../../app/auth', () => ({
  actionUserRequired: () => actionUserRequiredMock(),
}));

const sendMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@googleapis/gmail', () => ({
  gmail: () => ({ users: { messages: { send: sendMock } } }),
}));

vi.mock('../../server/auth/workspace', () => ({
  createWorkspaceAuth: () => ({}),
}));

import { submitBugReportAction } from './submitBugReportAction';

const baseInput = {
  reportId: 'r1',
  kind: 'bug' as const,
  title: 'T',
  description: 'D',
  context: {
    url: 'u',
    pathname: '/',
    buildId: 'b',
    database: '',
    userAgent: 'UA',
    platform: 'web',
    isNative: false,
    viewport: { width: 1, height: 1 },
    locale: 'de',
  },
  logs: [],
  screenshots: [],
  attachments: [],
};

describe('submitBugReportAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionUserRequiredMock.mockResolvedValue({
      user: { id: 'uid1', email: 'me@ff-neusiedlamsee.at', name: 'Me' },
    });
    process.env.GOOGLE_SERVICE_ACCOUNT = 'sa';
    process.env.EINSATZMAPPE_IMPERSONATION_ACCOUNT = 'me@example.com';
    process.env.NEXTAUTH_URL = 'https://app';
  });

  it('calls auth guard and writes report with server-set createdBy', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ recipientEmails: ['a@x'], enabled: true }),
    });
    await submitBugReportAction(baseInput);

    expect(actionUserRequiredMock).toHaveBeenCalled();
    const written = mockSet.mock.calls[0][0];
    expect(written.createdBy).toEqual({
      uid: 'uid1',
      email: 'me@ff-neusiedlamsee.at',
      displayName: 'Me',
    });
    expect(written.status).toBe('open');
  });

  it('skips email when config disabled', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ recipientEmails: ['a@x'], enabled: false }),
    });
    await submitBugReportAction(baseInput);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('skips email when no recipients', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ recipientEmails: [], enabled: true }),
    });
    await submitBugReportAction(baseInput);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('writes notificationError on mail failure but does not throw', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ recipientEmails: ['a@x'], enabled: true }),
    });
    sendMock.mockRejectedValueOnce(new Error('SMTP down'));

    await expect(submitBugReportAction(baseInput)).resolves.toEqual({
      reportId: 'r1',
    });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ notificationError: 'SMTP down' }),
    );
  });
});
