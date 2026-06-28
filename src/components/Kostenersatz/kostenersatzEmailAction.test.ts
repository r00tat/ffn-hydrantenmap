import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

// --- Firestore admin mock -------------------------------------------------
const calcGet = vi.fn();
const calcUpdate = vi.fn().mockResolvedValue(undefined);
const configGet = vi.fn();
const ratesGet = vi.fn();

const calcDocRef = { get: calcGet, update: calcUpdate };
const subColl = { doc: vi.fn(() => calcDocRef) };
const firecallDocRef = { collection: vi.fn(() => subColl) };
const firecallColl = { doc: vi.fn(() => firecallDocRef) };
const configColl = { doc: vi.fn(() => ({ get: configGet })) };
const ratesColl = { where: vi.fn(() => ({ get: ratesGet })) };

const mockCollection = vi.fn((name: string) => {
  switch (name) {
    case 'kostenersatzConfig':
      return configColl;
    case 'call':
      return firecallColl;
    case 'kostenersatzRates':
      return ratesColl;
    default:
      return { doc: vi.fn(() => ({ get: vi.fn(), update: vi.fn() })) };
  }
});

vi.mock('../../server/firebase/admin', () => ({
  firestore: { collection: (...args: unknown[]) => mockCollection(...(args as [string])) },
}));

vi.mock('../firebase/firestore', () => ({
  FIRECALL_COLLECTION_ID: 'call',
}));

const actionAuthMock = vi.fn();
vi.mock('../../app/auth', () => ({
  actionUserAuthorizedForFirecall: () => actionAuthMock(),
}));

const sendMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@googleapis/gmail', () => ({
  gmail: () => ({ users: { messages: { send: sendMock } } }),
}));

vi.mock('../../server/auth/workspace', () => ({
  createWorkspaceAuth: () => ({}),
}));

vi.mock('@react-pdf/renderer', () => ({
  renderToBuffer: vi.fn().mockResolvedValue(Buffer.from('pdf')),
}));

vi.mock('./KostenersatzPdf', () => ({
  default: () => ({}),
}));

import { sendKostenersatzEmailAction } from './kostenersatzEmailAction';

const baseRequest = {
  firecallId: 'fc1',
  calculationId: 'calc1',
  to: 'kunde@example.com',
  cc: [],
  subject: 'Kostenersatz',
  body: 'Rechnung anbei',
};

function draftCalculation() {
  return {
    id: 'calc1',
    status: 'draft',
    rateVersion: 'LGBl_77_2023',
    recipient: { name: 'Max Mustermann', email: 'kunde@example.com' },
    items: [],
    customItems: [],
    totalSum: 100,
    comment: '',
  };
}

describe('sendKostenersatzEmailAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_SERVICE_ACCOUNT = 'sa';
    process.env.EINSATZMAPPE_IMPERSONATION_ACCOUNT = 'me@example.com';
    actionAuthMock.mockResolvedValue({ id: 'fc1', name: 'Einsatz 1', date: '2024-01-01' });
    configGet.mockResolvedValue({ exists: false });
    ratesGet.mockResolvedValue({ empty: true, docs: [] });
  });

  it('sends the invoice for a draft calculation (no longer rejected)', async () => {
    calcGet.mockResolvedValue({ exists: true, id: 'calc1', data: () => draftCalculation() });

    const result = await sendKostenersatzEmailAction(baseRequest);

    expect(result.success).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('marks the calculation as completed (not sent) after sending', async () => {
    calcGet.mockResolvedValue({ exists: true, id: 'calc1', data: () => draftCalculation() });

    await sendKostenersatzEmailAction(baseRequest);

    expect(calcUpdate).toHaveBeenCalledTimes(1);
    const update = calcUpdate.mock.calls[0][0];
    expect(update.status).toBe('completed');
    expect(update.emailSentAt).toBeTruthy();
  });
});
