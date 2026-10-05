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

vi.mock('../../server/auth/baseUrl', () => ({
  getBaseUrl: async () => 'https://karte.example.at',
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

import { notifyNachbestellung } from './notifyNachbestellung';

const items = [
  {
    geraetId: 'g1',
    bezeichnung: 'Bindevlies Economy',
    bestandGesamt: 2,
    mindestbestand: 5,
    einheit: 'Sack',
  },
];

function configDoc(mangelEmails: unknown) {
  return { exists: true, data: () => ({ groupId: 'ffnd', mangelEmails }) };
}

describe('notifyNachbestellung', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mailSenderMock.mockReturnValue('noreply@example.at');
    sendRawMailMock.mockResolvedValue(undefined);
    groupGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ name: 'FF Neusiedl am See' }),
    });
    configGetMock.mockResolvedValue(
      configDoc(['zeugwart@example.at', 'kommandant@example.at']),
    );
  });

  it('schickt die Mail an die Mängel-Empfänger der Gruppe', async () => {
    await expect(notifyNachbestellung({ groupId: 'ffnd', items })).resolves.toBe(
      true,
    );
    expect(sendRawMailMock).toHaveBeenCalledOnce();
    const raw = sendRawMailMock.mock.calls[0][0] as string;
    expect(raw).toContain('To: zeugwart@example.at');
    expect(raw).toContain('Cc: kommandant@example.at');
  });

  it('verschickt nichts ohne Artikel', async () => {
    await expect(
      notifyNachbestellung({ groupId: 'ffnd', items: [] }),
    ).resolves.toBe(false);
    expect(configGetMock).not.toHaveBeenCalled();
    expect(sendRawMailMock).not.toHaveBeenCalled();
  });

  it('verschickt nichts ohne gepflegte Empfänger', async () => {
    configGetMock.mockResolvedValue({ exists: false });
    await expect(notifyNachbestellung({ groupId: 'ffnd', items })).resolves.toBe(
      false,
    );
    expect(sendRawMailMock).not.toHaveBeenCalled();
  });

  it('überspringt unbrauchbare Adressen', async () => {
    configGetMock.mockResolvedValue(configDoc(['kein-mail', 42, 'zeugwart@example.at']));
    await notifyNachbestellung({ groupId: 'ffnd', items });
    const raw = sendRawMailMock.mock.calls[0][0] as string;
    expect(raw).toContain('To: zeugwart@example.at');
    expect(raw).not.toContain('Cc:');
  });

  it('schluckt einen Versandfehler und protokolliert ihn', async () => {
    sendRawMailMock.mockRejectedValue(new Error('gmail down'));
    await expect(notifyNachbestellung({ groupId: 'ffnd', items })).resolves.toBe(
      false,
    );
    expect(console.error).toHaveBeenCalled();
  });

  it('schluckt einen nicht konfigurierten Mailversand', async () => {
    mailSenderMock.mockReturnValue(undefined);
    await expect(notifyNachbestellung({ groupId: 'ffnd', items })).resolves.toBe(
      false,
    );
    expect(sendRawMailMock).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it('verschickt auch ohne lesbares Gruppendokument', async () => {
    groupGetMock.mockRejectedValue(new Error('permission denied'));
    await expect(notifyNachbestellung({ groupId: 'ffnd', items })).resolves.toBe(
      true,
    );
  });
});
