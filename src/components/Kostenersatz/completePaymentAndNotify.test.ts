import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

// --- Firestore admin mock -------------------------------------------------
const calcGet = vi.fn();
const calcUpdate = vi.fn().mockResolvedValue(undefined);
const firecallGet = vi.fn();
const configGet = vi.fn();
const ratesGet = vi.fn();

const calcDocRef = { get: calcGet, update: calcUpdate };
const subColl = { doc: vi.fn(() => calcDocRef) };
const firecallDocRef = { collection: vi.fn(() => subColl), get: firecallGet };
const firecallColl = { doc: vi.fn(() => firecallDocRef) };
const configColl = { doc: vi.fn(() => ({ get: configGet })) };
const ratesColl = { where: vi.fn(() => ({ get: ratesGet })) };
const groupDocRef = { collection: vi.fn(() => configColl) };
const groupColl = { doc: vi.fn(() => groupDocRef) };

const mockCollection = vi.fn((name: string) => {
  switch (name) {
    case 'kostenersatzConfig':
      return configColl;
    case 'groups':
      return groupColl;
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
  GROUP_COLLECTION_ID: 'groups',
}));
// Absender und Bankverbindung stehen seit den Gruppen-Stammdaten unter der
// Gruppe; der Guard davor ist in `requireStammdaten.test.ts` eigen getestet.
vi.mock('../../server/groups/requireStammdaten', async () => {
  const actual = await vi.importActual<
    typeof import('../../server/groups/requireStammdaten')
  >('../../server/groups/requireStammdaten');
  return {
    ...actual,
    requireStammdatenForFirecall: async () => ({
      groupId: 'ffnd',
      feuerwehrName: 'Musterdorf',
      stammdaten: {
        absenderName: 'Freiwillige Feuerwehr Musterdorf',
        absenderAdresse: 'Hauptstraße 1',
        absenderKontakt: '',
        kontoinhaber: '',
        iban: 'AT40 3300 0000 0202 0402',
        bic: '',
      },
    }),
  };
});

vi.mock('../../server/groups/stammdatenStore', () => ({
  loadStammdatenLogo: async () => undefined,
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

import { completePaymentAndNotify } from './completePaymentAndNotify';

function draftCalculation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'calc1',
    status: 'draft',
    rateVersion: 'LGBl_77_2023',
    recipient: { name: 'Max Mustermann', email: 'kunde@example.com' },
    items: [],
    customItems: [],
    totalSum: 100,
    comment: '',
    ...overrides,
  };
}

const firecallData = { id: 'fc1', name: 'Einsatz 1', date: '2024-01-01' };

describe('completePaymentAndNotify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_SERVICE_ACCOUNT = 'sa';
    process.env.EINSATZMAPPE_IMPERSONATION_ACCOUNT = 'me@example.com';
    firecallGet.mockResolvedValue({ exists: true, id: 'fc1', data: () => firecallData });
    configGet.mockResolvedValue({ exists: false }); // -> DEFAULT_EMAIL_CONFIG (has ccEmail)
    ratesGet.mockResolvedValue({ empty: true, docs: [] });
  });

  it('closes the calculation as completed only after the email is sent', async () => {
    calcGet.mockResolvedValue({ exists: true, id: 'calc1', data: () => draftCalculation() });

    const result = await completePaymentAndNotify('fc1', 'calc1');

    expect(result).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
    // Status is only written once — after the mail went out — and it is 'completed'.
    expect(calcUpdate).toHaveBeenCalledTimes(1);
    const update = calcUpdate.mock.calls[0][0];
    expect(update.status).toBe('completed');
    expect(update.emailSentAt).toBeTruthy();
  });

  it('does NOT close the calculation when no email can be sent (no recipient/cc email)', async () => {
    configGet.mockResolvedValue({
      exists: true,
      data: () => ({
        fromEmail: 'from@example.com',
        ccEmail: '',
        subjectTemplate: 'S',
        bodyTemplate: 'B',
      }),
    });
    calcGet.mockResolvedValue({
      exists: true,
      id: 'calc1',
      data: () => draftCalculation({ recipient: { name: 'Max', email: '' } }),
    });

    const result = await completePaymentAndNotify('fc1', 'calc1');

    expect(result).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
    expect(calcUpdate).not.toHaveBeenCalled();
  });

  it('does NOT close the calculation when sending the email fails', async () => {
    calcGet.mockResolvedValue({ exists: true, id: 'calc1', data: () => draftCalculation() });
    sendMock.mockRejectedValueOnce(new Error('Gmail down'));

    const result = await completePaymentAndNotify('fc1', 'calc1');

    expect(result).toBe(false);
    expect(calcUpdate).not.toHaveBeenCalled();
  });

  it('is idempotent for already completed calculations', async () => {
    calcGet.mockResolvedValue({
      exists: true,
      id: 'calc1',
      data: () => draftCalculation({ status: 'completed' }),
    });

    const result = await completePaymentAndNotify('fc1', 'calc1');

    expect(result).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
    expect(calcUpdate).not.toHaveBeenCalled();
  });
});
