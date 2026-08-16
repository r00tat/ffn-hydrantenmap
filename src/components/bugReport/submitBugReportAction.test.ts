import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const mockCreate = vi.fn().mockResolvedValue(undefined);
const mockGet = vi.fn();
const mockUpdate = vi.fn().mockResolvedValue(undefined);
const mockDoc = vi.fn(() => ({
  create: mockCreate,
  get: mockGet,
  update: mockUpdate,
}));
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

const VALID_UUID = '11111111-1111-4111-8111-111111111111';

/** Gmail bekommt die Nachricht base64url-kodiert, der Textteil noch einmal base64. */
function decodeRawMailBody(encoded: string): string {
  const message = Buffer.from(
    encoded.replace(/-/g, '+').replace(/_/g, '/'),
    'base64',
  ).toString('utf8');
  const part = message.match(
    /Content-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/,
  );
  if (!part) throw new Error('kein base64-Textteil in der Nachricht');
  return Buffer.from(part[1], 'base64').toString('utf8');
}

const baseInput = {
  reportId: VALID_UUID,
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
    const written = mockCreate.mock.calls[0][0];
    expect(written.createdBy).toEqual({
      uid: 'uid1',
      email: 'me@ff-neusiedlamsee.at',
      displayName: 'Me',
    });
    expect(written.status).toBe('open');
  });

  it('rejects an invalid (non-UUID) reportId without writing', async () => {
    await expect(
      submitBugReportAction({ ...baseInput, reportId: 'r1' }),
    ).rejects.toThrow('Invalid reportId');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects overwriting an existing report (ALREADY_EXISTS)', async () => {
    mockCreate.mockRejectedValueOnce({ code: 6 });
    await expect(submitBugReportAction(baseInput)).rejects.toThrow(
      'Report already exists',
    );
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

  it('writes the server timestamp but mails a resolvable date (#670)', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ recipientEmails: ['a@x'], enabled: true }),
    });
    await submitBugReportAction(baseInput);

    // Firestore keeps the authoritative timestamp …
    expect(mockCreate.mock.calls[0][0].createdAt).toBe('SERVER_TS');

    // … the mail must not contain the unresolved sentinel.
    const raw = sendMock.mock.calls[0][0].requestBody.raw as string;
    const body = decodeRawMailBody(raw);
    expect(body).not.toContain('[object Object]');
    expect(body).not.toContain('SERVER_TS');
    expect(body).toMatch(/Datum:\s+\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}:\d{2}/);
  });

  it('writes notificationError on mail failure but does not throw', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ recipientEmails: ['a@x'], enabled: true }),
    });
    sendMock.mockRejectedValueOnce(new Error('SMTP down'));

    await expect(submitBugReportAction(baseInput)).resolves.toEqual({
      reportId: VALID_UUID,
    });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ notificationError: 'SMTP down' }),
    );
  });
});
