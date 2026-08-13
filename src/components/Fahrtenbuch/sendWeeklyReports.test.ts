import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { sendRawMailMock, mailSenderMock, firestoreState } = vi.hoisted(() => ({
  sendRawMailMock: vi.fn(),
  mailSenderMock: vi.fn(),
  firestoreState: {
    configs: [] as { id: string; data: Record<string, unknown> }[],
    groups: {} as Record<string, Record<string, unknown> | Error>,
    vehicles: [] as Record<string, unknown>[],
    entries: [] as Record<string, unknown>[],
    previous: [] as Record<string, unknown>[],
    mangel: [] as Record<string, unknown>[],
  },
}));

vi.mock('../../server/mail/sendRawMail', () => ({
  sendRawMail: sendRawMailMock,
  mailSender: mailSenderMock,
}));

function snapshot(docs: Record<string, unknown>[]) {
  return {
    docs: docs.map((data) => ({
      id: (data.id as string) ?? 'doc',
      data: () => data,
    })),
  };
}

/**
 * Ein Query-Objekt, das `where`, `orderBy` und `limit` verkettbar annimmt und
 * beim `get()` die vorbereiteten Dokumente liefert.
 *
 * Die Vorgängerabfrage wird an ihrem `where('abfahrt', '<', …)` erkannt und
 * nicht am `limit(1)`: In einer verketteten Abfrage kommt `limit` zuletzt, ein
 * Merker daraus wäre also erst nach dem Aufbau gesetzt. Der Operator ist der
 * eigentliche Unterschied zwischen den beiden Abfragen.
 */
function query(kind: 'vehicle' | 'fahrtenbuch' | 'mangel') {
  let previous = false;
  const self: any = {
    where: (field: string, op: string) => {
      if (field === 'abfahrt' && op === '<') previous = true;
      return self;
    },
    orderBy: () => self,
    limit: () => self,
    get: async () => {
      if (kind === 'vehicle') return snapshot(firestoreState.vehicles);
      if (kind === 'mangel') return snapshot(firestoreState.mangel);
      return snapshot(
        previous ? firestoreState.previous : firestoreState.entries,
      );
    },
  };
  return self;
}

vi.mock('../../server/firebase/admin', () => ({
  firestore: {
    collection: (name: string) => {
      if (name === 'fahrtenbuchConfig') {
        return {
          get: async () => ({
            docs: firestoreState.configs.map((c) => ({
              id: c.id,
              data: () => c.data,
            })),
          }),
        };
      }
      // groups
      return {
        doc: (groupId: string) => ({
          get: async () => {
            const entry = firestoreState.groups[groupId];
            if (entry instanceof Error) throw entry;
            return { exists: !!entry, data: () => entry };
          },
          collection: (sub: string) =>
            query(sub as 'vehicle' | 'fahrtenbuch' | 'mangel'),
        }),
      };
    },
  },
}));

import { sendWeeklyReports } from './sendWeeklyReports';
import { resolveReportPeriod } from './weeklyReportPeriod';

const period = resolveReportPeriod({ year: 2026, week: 32 });

const vehicleDoc = {
  id: 'v1',
  name: 'KDTFA',
  active: true,
  counters: [
    {
      id: 'km',
      label: 'Kilometerstand',
      unit: 'km',
      mode: 'startEnd',
      changeWarning: 'decrease',
      required: true,
    },
  ],
  fuelTypes: ['diesel'],
};

const entryDoc = {
  id: 'e1',
  vehicleId: 'v1',
  vehicleName: 'KDTFA',
  driverName: 'Lukas Fürst',
  zweck: 'einsatz',
  ziel: 'B1 - Flurbrand',
  abfahrt: '2026-08-05T17:00:00.000Z',
  ankunft: '2026-08-05T17:34:00.000Z',
  counters: { km: { start: 17552, end: 17557, diff: 5 } },
  group: 'ffnd',
  deleted: false,
};

describe('sendWeeklyReports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mailSenderMock.mockReturnValue('noreply@example.at');
    process.env.NEXTAUTH_URL = 'https://karte.example.at';
    firestoreState.configs = [
      {
        id: 'ffnd',
        data: { groupId: 'ffnd', mangelEmails: ['zeugwart@example.at'] },
      },
    ];
    firestoreState.groups = { ffnd: { name: 'FF Neusiedl am See' } };
    firestoreState.vehicles = [vehicleDoc];
    firestoreState.entries = [entryDoc];
    firestoreState.previous = [];
    firestoreState.mangel = [];
  });

  it('verschickt je Gruppe eine Mail an den ersten Empfänger', async () => {
    const results = await sendWeeklyReports({ period });
    expect(results).toMatchObject([
      { groupId: 'ffnd', status: 'sent', recipientCount: 1, entryCount: 1 },
    ]);
    expect(sendRawMailMock).toHaveBeenCalledOnce();
    expect(sendRawMailMock.mock.calls[0][0]).toContain(
      'To: zeugwart@example.at',
    );
  });

  it('setzt weitere Empfänger als Cc', async () => {
    firestoreState.configs[0].data.mangelEmails = [
      'zeugwart@example.at',
      'kommandant@example.at',
    ];
    await sendWeeklyReports({ period });
    expect(sendRawMailMock.mock.calls[0][0]).toContain(
      'Cc: kommandant@example.at',
    );
  });

  it('überspringt eine Gruppe ohne gepflegte Empfänger', async () => {
    firestoreState.configs[0].data.mangelEmails = [];
    const results = await sendWeeklyReports({ period });
    expect(results).toMatchObject([{ groupId: 'ffnd', status: 'skipped' }]);
    expect(sendRawMailMock).not.toHaveBeenCalled();
  });

  it('überspringt unbrauchbare Adressen im Altbestand', async () => {
    // Verteidigung gegen Altbestand: Was gespeichert ist, muss nicht mehr dem
    // entsprechen, was die heutige Validierung durchlässt.
    firestoreState.configs[0].data.mangelEmails = [
      '  ',
      'kein-mail',
      'zeugwart@example.at',
      42,
    ];
    const results = await sendWeeklyReports({ period });
    expect(results[0]).toMatchObject({ status: 'sent', recipientCount: 1 });
    expect(sendRawMailMock.mock.calls[0][0]).not.toContain('Cc:');
  });

  it('verschickt auch bei einer Woche ohne Fahrten', async () => {
    firestoreState.entries = [];
    const results = await sendWeeklyReports({ period });
    expect(results[0]).toMatchObject({ status: 'sent', entryCount: 0 });
    expect(sendRawMailMock).toHaveBeenCalledOnce();
  });

  it('verschickt auch ohne lesbares Gruppendokument', async () => {
    firestoreState.groups = { ffnd: new Error('permission denied') };
    const results = await sendWeeklyReports({ period });
    expect(results[0]).toMatchObject({ status: 'sent' });
  });

  it('lässt einen Fehler einer Gruppe die anderen nicht verhindern', async () => {
    firestoreState.configs = [
      { id: 'a', data: { groupId: 'a', mangelEmails: ['a@example.at'] } },
      { id: 'b', data: { groupId: 'b', mangelEmails: ['b@example.at'] } },
    ];
    firestoreState.groups = { a: { name: 'A' }, b: { name: 'B' } };
    sendRawMailMock.mockRejectedValueOnce(new Error('gmail down'));
    const results = await sendWeeklyReports({ period });
    expect(results).toMatchObject([
      { groupId: 'a', status: 'failed', error: 'gmail down' },
      { groupId: 'b', status: 'sent' },
    ]);
  });

  it('meldet alle Gruppen als fehlerhaft, wenn der Versand nicht konfiguriert ist', async () => {
    mailSenderMock.mockReturnValue(undefined);
    const results = await sendWeeklyReports({ period });
    expect(results[0]).toMatchObject({ status: 'failed' });
    expect(sendRawMailMock).not.toHaveBeenCalled();
  });

  it('sendet bei dryRun nicht und liefert Betreff und Text', async () => {
    const results = await sendWeeklyReports({ period, dryRun: true });
    expect(sendRawMailMock).not.toHaveBeenCalled();
    expect(results[0]).toMatchObject({ status: 'dryRun' });
    expect(results[0].subject).toContain('KW32');
    expect(results[0].text).toContain('KDTFA');
  });

  it('nimmt ein inaktives Fahrzeug ohne Fahrten nicht auf', async () => {
    firestoreState.vehicles = [
      vehicleDoc,
      { ...vehicleDoc, id: 'v2', name: 'Altfahrzeug', active: false },
    ];
    const results = await sendWeeklyReports({ period, dryRun: true });
    expect(results[0].text).not.toContain('Altfahrzeug');
  });

  it('nimmt ein inaktives Fahrzeug mit Fahrten auf', async () => {
    firestoreState.vehicles = [
      { ...vehicleDoc, id: 'v2', name: 'Altfahrzeug', active: false },
    ];
    firestoreState.entries = [
      { ...entryDoc, vehicleId: 'v2', vehicleName: 'Altfahrzeug' },
    ];
    const results = await sendWeeklyReports({ period, dryRun: true });
    expect(results[0].text).toContain('Altfahrzeug');
  });

  it('zählt Warnungen und offene Mängel mit', async () => {
    firestoreState.previous = [
      {
        ...entryDoc,
        id: 'e0',
        counters: { km: { start: 17540, end: 17550, diff: 10 } },
      },
    ];
    firestoreState.mangel = [
      {
        id: 'm1',
        vehicleId: 'v1',
        vehicleName: 'KDTFA',
        description: 'Blinker rechts defekt',
        status: 'open',
        notes: [],
        reportedAt: '2026-08-05T17:00:00.000Z',
        reportedByName: 'Lukas Fürst',
      },
      {
        id: 'm2',
        vehicleId: 'v1',
        vehicleName: 'KDTFA',
        description: 'Erledigt',
        status: 'resolved',
        notes: [],
        reportedAt: '2026-07-01T00:00:00.000Z',
        reportedByName: 'X',
      },
    ];
    const results = await sendWeeklyReports({ period, dryRun: true });
    expect(results[0]).toMatchObject({ warningCount: 1, openMangelCount: 1 });
    expect(results[0].text).toContain('Blinker rechts defekt');
    expect(results[0].text).not.toContain('Erledigt');
  });
});
