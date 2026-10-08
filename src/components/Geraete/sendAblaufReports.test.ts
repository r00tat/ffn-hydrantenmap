import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { sendRawMailMock, mailSenderMock, state } = vi.hoisted(() => ({
  sendRawMailMock: vi.fn(),
  mailSenderMock: vi.fn(),
  state: {
    groups: [] as { id: string; data: Record<string, unknown> }[],
    geraete: {} as Record<string, Record<string, unknown>[] | Error>,
    bestaende: {} as Record<string, Record<string, unknown>[]>,
    configs: {} as Record<string, Record<string, unknown>>,
  },
}));

vi.mock('../../server/mail/sendRawMail', () => ({
  sendRawMail: sendRawMailMock,
  mailSender: mailSenderMock,
}));

vi.mock('../../server/auth/baseUrl', () => ({
  getBaseUrl: async () => 'https://karte.example.at',
}));

function snapshot(docs: Record<string, unknown>[]) {
  return {
    docs: docs.map((data) => ({ id: data.id as string, data: () => data })),
  };
}

vi.mock('../../server/firebase/admin', () => ({
  firestore: {
    collection: (name: string) => {
      if (name === 'fahrtenbuchConfig') {
        return {
          doc: (groupId: string) => ({
            get: async () => ({
              exists: !!state.configs[groupId],
              data: () => state.configs[groupId],
            }),
          }),
        };
      }
      // groups
      return {
        get: async () => ({
          docs: state.groups.map((g) => ({ id: g.id, data: () => g.data })),
        }),
        doc: (groupId: string) => ({
          get: async () => {
            const group = state.groups.find((g) => g.id === groupId);
            return { exists: !!group, data: () => group?.data };
          },
          collection: (sub: string) => ({
            get: async () => {
              if (sub === 'geraet') {
                const entry = state.geraete[groupId] ?? [];
                if (entry instanceof Error) throw entry;
                return snapshot(entry);
              }
              return snapshot(state.bestaende[groupId] ?? []);
            },
          }),
        }),
      };
    },
  },
}));

import { sendAblaufReports } from './sendAblaufReports';

// 2026-10-08 22:30 UTC ist in Wien schon der 9. Oktober.
const now = new Date('2026-10-08T22:30:00.000Z');

function geraet(id: string, ablaufDatum: string) {
  return {
    id,
    bezeichnung: `Artikel ${id}`,
    verbrauchsmaterial: true,
    einheit: 'Stk',
    chargen: [
      { id: `c-${id}`, produktionsNummer: 'L1', ablaufDatum, createdAt: '', createdBy: '' },
    ],
  };
}

function bestand(id: string, geraetId: string, menge: number) {
  return {
    id,
    geraetId,
    lagerortKey: id,
    lagerort: { art: 'raum', standort: 'FF-Haus', raum: 'Lager' },
    anzahl: menge,
    chargen: { [`c-${geraetId}`]: menge },
  };
}

describe('sendAblaufReports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mailSenderMock.mockReturnValue('noreply@example.at');
    sendRawMailMock.mockResolvedValue(undefined);
    state.groups = [{ id: 'ffnd', data: { name: 'FF Neusiedl am See' } }];
    state.geraete = { ffnd: [geraet('g1', '2026-10-08'), geraet('g2', '2026-11-01')] };
    state.bestaende = {
      ffnd: [bestand('b1', 'g1', 2), bestand('b2', 'g2', 5)],
    };
    state.configs = { ffnd: { mangelEmails: ['zeugwart@example.at', 'kaputt', 'kdt@example.at'] } };
  });

  it('verschickt je Gruppe eine Sammelmail an die Mängel-Empfänger', async () => {
    const results = await sendAblaufReports({ dryRun: false, now });
    expect(results).toEqual([{ groupId: 'ffnd', status: 'sent', count: 2 }]);
    expect(sendRawMailMock).toHaveBeenCalledOnce();
    const raw = sendRawMailMock.mock.calls[0][0] as string;
    expect(raw).toContain('To: zeugwart@example.at');
    expect(raw).toContain('Cc: kdt@example.at');
  });

  it('rechnet „heute" in Wiener Zeit', async () => {
    // Ablauf am 8.10.: in Wien am 9.10. schon abgelaufen.
    const results = await sendAblaufReports({ dryRun: true, now });
    expect(results[0].status).toBe('dryRun');
    expect(results[0].subject).toContain('1 abgelaufen');
  });

  it('verschickt bei dryRun nichts und liefert Betreff und Text', async () => {
    const results = await sendAblaufReports({ dryRun: true, now });
    expect(sendRawMailMock).not.toHaveBeenCalled();
    expect(results[0]).toMatchObject({ status: 'dryRun', count: 2 });
    expect(results[0].text).toContain('Artikel g1');
  });

  it('überspringt eine Gruppe ohne ablaufende Chargen', async () => {
    state.geraete = { ffnd: [geraet('g1', '2027-12-31')] };
    const results = await sendAblaufReports({ dryRun: false, now });
    expect(results).toEqual([{ groupId: 'ffnd', status: 'skipped', count: 0 }]);
    expect(sendRawMailMock).not.toHaveBeenCalled();
  });

  it('lässt Gruppen ohne Geräte aus', async () => {
    state.groups.push({ id: 'leer', data: { name: 'Leer' } });
    const results = await sendAblaufReports({ dryRun: false, now });
    expect(results.map((r) => r.groupId)).toEqual(['ffnd']);
  });

  it('überspringt eine Gruppe ohne Empfänger', async () => {
    state.configs = {};
    const results = await sendAblaufReports({ dryRun: false, now });
    expect(results).toEqual([{ groupId: 'ffnd', status: 'skipped', count: 2 }]);
    expect(sendRawMailMock).not.toHaveBeenCalled();
  });

  it('lässt sich von einer scheiternden Gruppe nicht aufhalten', async () => {
    state.groups = [
      { id: 'kaputt', data: { name: 'Kaputt' } },
      { id: 'ffnd', data: { name: 'FF Neusiedl am See' } },
    ];
    state.geraete.kaputt = new Error('firestore down');
    const results = await sendAblaufReports({ dryRun: false, now });
    expect(results).toEqual([
      { groupId: 'kaputt', status: 'failed', count: 0, error: 'firestore down' },
      { groupId: 'ffnd', status: 'sent', count: 2 },
    ]);
  });

  it('meldet einen Versandfehler als failed', async () => {
    sendRawMailMock.mockRejectedValue(new Error('gmail down'));
    const results = await sendAblaufReports({ dryRun: false, now });
    expect(results).toEqual([
      { groupId: 'ffnd', status: 'failed', count: 2, error: 'gmail down' },
    ]);
  });
});
