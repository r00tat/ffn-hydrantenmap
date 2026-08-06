import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { configGetMock, groupGetMock, sendRawMailMock, mailSenderMock } = vi.hoisted(
  () => ({
    configGetMock: vi.fn(),
    groupGetMock: vi.fn(),
    sendRawMailMock: vi.fn(),
    mailSenderMock: vi.fn(),
  }),
);

vi.mock('../../server/mail/sendRawMail', () => ({
  sendRawMail: sendRawMailMock,
  mailSender: mailSenderMock,
}));

vi.mock('../../server/firebase/admin', () => ({
  firestore: {
    collection: (name: string) => ({
      doc: () => ({
        get: name === 'fahrtenbuchConfig' ? configGetMock : groupGetMock,
      }),
    }),
  },
}));

import type { FahrtenbuchEntry } from '../../common/fahrtenbuch';
import { notifyMangel } from './notifyMangel';

const vehicle = {
  name: 'MTF',
  kennzeichen: 'ND-123AB',
  counters: [
    {
      id: 'km',
      label: 'Kilometerstand',
      unit: 'km',
      mode: 'startEnd' as const,
      changeWarning: 'decrease' as const,
      required: true,
    },
  ],
};

const entry: FahrtenbuchEntry = {
  vehicleId: 'v1',
  vehicleName: 'MTF',
  driverName: 'Hans Muster',
  zweck: 'uebung',
  ziel: 'Übungsplatz',
  abfahrt: '2026-02-01T07:30:00.000Z',
  ankunft: '2026-02-01T08:15:00.000Z',
  counters: { km: { start: 12000, end: 12045, diff: 45 } },
  hinweise: 'Bremse schleift.',
  defekt: true,
  group: 'ffnd',
  deleted: false,
  createdAt: '2026-02-01T08:20:00.000Z',
  createdBy: 'uid-1',
  createdByName: 'Hans Muster',
  updatedAt: '2026-02-01T08:20:00.000Z',
  updatedBy: 'uid-1',
};

function configDoc(mangelEmails: unknown) {
  return { exists: true, data: () => ({ groupId: 'ffnd', mangelEmails }) };
}

describe('notifyMangel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mailSenderMock.mockReturnValue('noreply@example.at');
    groupGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ name: 'FF Neusiedl am See' }),
    });
    configGetMock.mockResolvedValue(configDoc(['zeugwart@example.at']));
    process.env.NEXTAUTH_URL = 'https://karte.example.at';
  });

  it('verschickt die Mail an den gepflegten Empfänger', async () => {
    await expect(notifyMangel({ groupId: 'ffnd', entry, vehicle })).resolves.toBe(
      true,
    );
    expect(sendRawMailMock).toHaveBeenCalledOnce();
    const raw = sendRawMailMock.mock.calls[0][0] as string;
    expect(raw).toContain('To: zeugwart@example.at');
    expect(raw).toContain('From: noreply@example.at');
  });

  it('setzt weitere Empfänger als Cc', async () => {
    configGetMock.mockResolvedValue(
      configDoc(['zeugwart@example.at', 'kommandant@example.at']),
    );
    await notifyMangel({ groupId: 'ffnd', entry, vehicle });
    expect(sendRawMailMock.mock.calls[0][0]).toContain(
      'Cc: kommandant@example.at',
    );
  });

  it('übernimmt den Gruppennamen in die Mail', async () => {
    await notifyMangel({ groupId: 'ffnd', entry, vehicle });
    const body = Buffer.from(
      (sendRawMailMock.mock.calls[0][0] as string).split('\r\n\r\n').pop()!,
      'base64',
    ).toString();
    expect(body).toContain('FF Neusiedl am See');
  });

  it('verschickt nichts, wenn für die Gruppe nichts gepflegt ist', async () => {
    configGetMock.mockResolvedValue({ exists: false });
    await expect(notifyMangel({ groupId: 'ffnd', entry, vehicle })).resolves.toBe(
      false,
    );
    expect(sendRawMailMock).not.toHaveBeenCalled();
  });

  it('verschickt nichts bei leerer Empfängerliste', async () => {
    configGetMock.mockResolvedValue(configDoc([]));
    await expect(notifyMangel({ groupId: 'ffnd', entry, vehicle })).resolves.toBe(
      false,
    );
    expect(sendRawMailMock).not.toHaveBeenCalled();
  });

  it('überspringt unbrauchbare Einträge in der gespeicherten Liste', async () => {
    // Verteidigung gegen Altbestand: Was gespeichert ist, muss nicht mehr dem
    // entsprechen, was die heutige Validierung durchlässt.
    configGetMock.mockResolvedValue(
      configDoc(['  ', 'kein-mail', 'zeugwart@example.at', 42]),
    );
    await notifyMangel({ groupId: 'ffnd', entry, vehicle });
    const raw = sendRawMailMock.mock.calls[0][0] as string;
    expect(raw).toContain('To: zeugwart@example.at');
    expect(raw).not.toContain('Cc:');
  });

  it('verschickt nichts, wenn keine brauchbare Adresse übrig bleibt', async () => {
    configGetMock.mockResolvedValue(configDoc(['kein-mail']));
    await expect(notifyMangel({ groupId: 'ffnd', entry, vehicle })).resolves.toBe(
      false,
    );
    expect(sendRawMailMock).not.toHaveBeenCalled();
  });

  it('meldet einen nicht konfigurierten Mailversand als Fehler', async () => {
    // Der Aufrufer fängt das ab und protokolliert es — stillschweigend nichts
    // zu tun wäre hier falsch: Es sind Empfänger gepflegt, die Mail bleibt aber
    // aus, und das muss im Log stehen.
    mailSenderMock.mockReturnValue(undefined);
    await expect(
      notifyMangel({ groupId: 'ffnd', entry, vehicle }),
    ).rejects.toThrow(/not configured/i);
    expect(sendRawMailMock).not.toHaveBeenCalled();
  });

  it('verschickt auch ohne lesbares Gruppendokument', async () => {
    groupGetMock.mockRejectedValue(new Error('permission denied'));
    await expect(notifyMangel({ groupId: 'ffnd', entry, vehicle })).resolves.toBe(
      true,
    );
    expect(sendRawMailMock).toHaveBeenCalledOnce();
  });
});
