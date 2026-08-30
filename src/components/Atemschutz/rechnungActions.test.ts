import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const guardMock = vi.fn();
const sendRawMailMock = vi.fn();

vi.mock('./rechnungGuards', () => ({
  actionFuellungRechnungRequired: (groupId: string) => guardMock(groupId),
}));

vi.mock('../../app/auth', () => ({
  actionGroupAdminRequired: vi.fn(),
}));

vi.mock('../firebase/firestore', () => ({
  GROUP_COLLECTION_ID: 'groups',
}));

vi.mock('../../server/mail/sendRawMail', () => ({
  sendRawMail: (raw: string) => sendRawMailMock(raw),
  mailSender: () => 'no-reply@ff-neusiedlamsee.at',
}));

vi.mock('./FuellungRechnungPdf', () => ({
  default: () => ({}),
}));

vi.mock('@react-pdf/renderer', () => ({
  renderToBuffer: vi.fn(async () => Buffer.from('%PDF-1.4 test')),
  Document: () => null,
  Page: () => null,
  Text: () => null,
  View: () => null,
  Image: () => null,
  StyleSheet: { create: (s: unknown) => s },
}));

const updateMock = vi.fn();
const batchUpdateMock = vi.fn();
const batchCommitMock = vi.fn();
const rechnungDaten = {
  nummer: 'ATS-2026-001',
  status: 'draft',
  empfaenger: {
    feuerwehr: 'Winden am See',
    name: 'FF Winden',
    adresse: 'A',
    email: 'kdo@ff-winden.at',
  },
  positionen: [
    {
      fuellungId: 'f1',
      zeitpunkt: '2026-03-12T09:00:00.000Z',
      anzahl: 1,
      rateId: '5.01',
      einzelpreis: 4.3,
      summe: 4.3,
    },
  ],
  rateVersion: 'LGBl_77_2023',
  summe: 4.3,
  datum: '2026-03-20T00:00:00.000Z',
  zeitraumVon: '2026-03-12T09:00:00.000Z',
  zeitraumBis: '2026-03-12T09:00:00.000Z',
};

vi.mock('./rechnungStore', () => ({
  empfaengerRef: () => ({
    doc: () => ({ get: async () => ({ exists: false }) }),
  }),
  fuellungRef: () => ({ doc: (id: string) => ({ id }) }),
  rechnungRef: () => ({ doc: () => ({ update: updateMock }) }),
  rechnungConfigRef: () => ({ set: vi.fn() }),
  loadRechnung: async () => ({ id: 'r1', ...rechnungDaten }),
  loadRechnungConfig: async () => ({
    ccEmail: 'kassier@ff-nsee.at',
    subjectTemplate: 'Rechnung {{ rechnung.nummer }}',
    bodyTemplate: 'Summe {{ rechnung.summe }}',
    bankText: 'AT40 3300',
    vorgabeTarif: '5.01',
  }),
  loadFuellungTarife: async () => ({
    preise: { '5.01': 4.3, '5.02': 6.4 },
    rateVersion: 'LGBl_77_2023',
  }),
  loadVolumen: async () => ({}),
}));

vi.mock('../../server/firebase/admin', () => ({
  firestore: {
    collection: () => ({
      doc: () => ({
        get: async () => ({
          data: () => ({ feuerwehrName: 'Neusiedl am See' }),
        }),
      }),
    }),
    batch: () => ({ update: batchUpdateMock, commit: batchCommitMock }),
    runTransaction: vi.fn(),
  },
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: () => '__delete__' },
}));

import {
  buildFuellungRechnungMail,
  cancelFuellungRechnung,
  sendFuellungRechnung,
  setFuellungRechnungBezahlt,
  updateFuellungRechnung,
} from './rechnungActions';

beforeEach(() => {
  vi.clearAllMocks();
  guardMock.mockResolvedValue({ user: { email: 'paul@ffnd.at' } });
});

describe('buildFuellungRechnungMail', () => {
  it('füllt Betreff und Text aus den Vorlagen und setzt die CC', async () => {
    const result = await buildFuellungRechnungMail({
      groupId: 'ffnd',
      rechnungId: 'r1',
    });
    expect(result.subject).toBe('Rechnung ATS-2026-001');
    expect(result.body).toContain('4,30');
    expect(result.to).toBe('kdo@ff-winden.at');
    expect(result.cc).toEqual(['kassier@ff-nsee.at']);
  });
});

describe('sendFuellungRechnung', () => {
  const request = {
    groupId: 'ffnd',
    rechnungId: 'r1',
    to: 'kdo@ff-winden.at',
    cc: ['kassier@ff-nsee.at'],
    subject: 'Rechnung ATS-2026-001',
    body: 'Text',
  };

  it('verschickt mit PDF im Anhang und setzt den Status', async () => {
    const result = await sendFuellungRechnung(request);

    expect(result.success).toBe(true);
    const raw = sendRawMailMock.mock.calls[0][0] as string;
    expect(raw).toContain('To: kdo@ff-winden.at');
    expect(raw).toContain('Cc: kassier@ff-nsee.at');
    expect(raw).toContain('filename="ATS-2026-001_FF_Winden.pdf"');
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent' }));
  });

  it('weist einen Aufrufer ohne Berechtigung ab, ohne zu verschicken', async () => {
    guardMock.mockRejectedValueOnce(new Error('forbidden'));
    const result = await sendFuellungRechnung(request);
    expect(result.success).toBe(false);
    expect(sendRawMailMock).not.toHaveBeenCalled();
  });

  it('verschickt eine stornierte Rechnung nicht', async () => {
    rechnungDaten.status = 'cancelled';
    const result = await sendFuellungRechnung(request);
    rechnungDaten.status = 'draft';
    expect(result).toMatchObject({
      success: false,
      error: 'rechnungStatusInvalid',
    });
    expect(sendRawMailMock).not.toHaveBeenCalled();
  });
});

describe('setFuellungRechnungBezahlt', () => {
  it('lässt den Sprung vom Entwurf auf bezahlt nicht zu', async () => {
    const result = await setFuellungRechnungBezahlt({
      groupId: 'ffnd',
      rechnungId: 'r1',
    });
    expect(result).toMatchObject({
      success: false,
      error: 'rechnungStatusInvalid',
    });
  });
});

describe('cancelFuellungRechnung', () => {
  it('löscht die rechnungId an den Füllungen und lässt verrechnen stehen', async () => {
    const result = await cancelFuellungRechnung({
      groupId: 'ffnd',
      rechnungId: 'r1',
    });

    expect(result.success).toBe(true);
    expect(batchCommitMock).toHaveBeenCalled();
    const patch = batchUpdateMock.mock.calls.at(-1)?.[1];
    expect(patch).toMatchObject({ rechnungId: '__delete__' });
    expect(patch).not.toHaveProperty('verrechnen');
  });
});

describe('updateFuellungRechnung', () => {
  const request = {
    groupId: 'ffnd',
    rechnungId: 'r1',
    empfaengerId: 'e1',
  };

  it('ändert nur einen Entwurf', async () => {
    rechnungDaten.status = 'sent';
    const result = await updateFuellungRechnung(request);
    rechnungDaten.status = 'draft';

    expect(result).toMatchObject({
      success: false,
      error: 'rechnungNurEntwurf',
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('verlangt einen Empfänger', async () => {
    const result = await updateFuellungRechnung({
      ...request,
      empfaengerId: '',
    });
    expect(result).toMatchObject({
      success: false,
      error: 'rechnungNoRecipient',
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('weist einen Aufrufer ohne Berechtigung ab', async () => {
    guardMock.mockRejectedValueOnce(new Error('forbidden'));
    const result = await updateFuellungRechnung(request);
    expect(result.success).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
