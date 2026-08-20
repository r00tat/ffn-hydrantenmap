import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { addMock, mangelQueryGetMock, latestEntryGetMock, vehicleSetMock } =
  vi.hoisted(() => ({
    addMock: vi.fn(),
    mangelQueryGetMock: vi.fn(),
    latestEntryGetMock: vi.fn(),
    vehicleSetMock: vi.fn(),
  }));

vi.mock('../../server/firebase/admin', () => {
  const mangelCollection = {
    add: addMock,
    doc: () => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }),
    where: () => mangelCollection,
    get: mangelQueryGetMock,
  };
  const entriesCollection = {
    where: () => entriesCollection,
    orderBy: () => entriesCollection,
    limit: () => entriesCollection,
    get: latestEntryGetMock,
  };
  const groupDoc = {
    collection: (name: string) => {
      if (name === 'vehicle') {
        return { doc: () => ({ get: vi.fn(), set: vehicleSetMock }) };
      }
      return name === 'mangel' ? mangelCollection : entriesCollection;
    },
  };
  return { firestore: { collection: () => ({ doc: () => groupDoc }) } };
});

import type { FahrtenbuchEntry } from '../../common/fahrtenbuch';
import { createMangelForEntry, refreshVehicleCache } from './mangelStore';

const actor = {
  userId: 'u1',
  userName: 'Max Mustermann',
  now: '2026-08-09T10:00:00.000Z',
};

const entry = {
  vehicleId: 'v1',
  vehicleName: 'TLF',
  driverName: 'Bernd Beispiel',
  zweck: 'uebung',
  ziel: 'Zeughaus',
  abfahrt: '2026-08-04T08:00:00.000Z',
  ankunft: '2026-08-04T09:00:00.000Z',
  counters: {},
  defekt: true,
  mangel: 'Blinker hinten links defekt',
  group: 'ffnd',
  deleted: false,
  createdAt: '2026-08-05T12:00:00.000Z',
  createdBy: 'u9',
  createdByName: 'Bernd Beispiel',
  updatedAt: '2026-08-05T12:00:00.000Z',
  updatedBy: 'u9',
} as FahrtenbuchEntry;

beforeEach(() => {
  vi.clearAllMocks();
  addMock.mockResolvedValue({ id: 'm1' });
  mangelQueryGetMock.mockResolvedValue({
    docs: [{ id: 'm1', data: () => ({ status: 'open' }) }],
  });
  latestEntryGetMock.mockResolvedValue({ docs: [] });
});

describe('createMangelForEntry', () => {
  it('legt den Mangel mit Bezug auf die meldende Fahrt an', async () => {
    const id = await createMangelForEntry({
      groupId: 'ffnd',
      entryId: 'e1',
      entry,
      vehicle: { name: 'TLF' },
      actor,
    });
    expect(id).toBe('m1');

    const doc = addMock.mock.calls[0][0];
    expect(doc).toMatchObject({
      vehicleId: 'v1',
      vehicleName: 'TLF',
      entryId: 'e1',
      description: 'Blinker hinten links defekt',
      status: 'open',
      group: 'ffnd',
    });
  });

  it('meldet den Mangel zum Zeitpunkt der Fahrt, nicht des Schreibens', async () => {
    // Eine Fahrt von Dienstag, die am Donnerstag nachgetragen wird, meldet
    // einen Mangel von Dienstag.
    await createMangelForEntry({
      groupId: 'ffnd',
      entryId: 'e1',
      entry,
      vehicle: { name: 'TLF' },
      actor,
    });
    const doc = addMock.mock.calls[0][0];
    expect(doc.reportedAt).toBe('2026-08-04T08:00:00.000Z');
    expect(doc.reportedByName).toBe('Bernd Beispiel');
    // Die Systemspur bleibt beim Schreibenden.
    expect(doc.createdBy).toBe('u1');
    expect(doc.createdAt).toBe(actor.now);
  });

  it('fällt auf die Hinweise zurück, wenn kein Mangeltext da ist', async () => {
    await createMangelForEntry({
      groupId: 'ffnd',
      entryId: 'e1',
      entry: { ...entry, mangel: undefined, hinweise: 'Bremse quietscht' },
      vehicle: { name: 'TLF' },
      actor,
    });
    expect(addMock.mock.calls[0][0].description).toBe('Bremse quietscht');
  });

  it('frischt den Mängelzähler des Fahrzeugs auf', async () => {
    mangelQueryGetMock.mockResolvedValue({
      docs: [
        { id: 'm1', data: () => ({ status: 'open' }) },
        { id: 'm2', data: () => ({ status: 'resolved' }) },
      ],
    });
    await createMangelForEntry({
      groupId: 'ffnd',
      entryId: 'e1',
      entry,
      vehicle: { name: 'TLF' },
      actor,
    });
    expect(vehicleSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ openMangelCount: 1 }),
      { merge: true },
    );
  });

  it('wirft, wenn weder Mangeltext noch Hinweise da sind', async () => {
    // Der Aufrufer behandelt das best-effort: Die Fahrt bleibt gespeichert,
    // der Fehler steht im Log. Ein Mangel ohne jede Beschreibung wäre in der
    // Übersicht eine leere Zeile.
    await expect(
      createMangelForEntry({
        groupId: 'ffnd',
        entryId: 'e1',
        entry: { ...entry, mangel: undefined, hinweise: undefined },
        vehicle: { name: 'TLF' },
        actor,
      }),
    ).rejects.toThrow(/descriptionMissing/);
    expect(addMock).not.toHaveBeenCalled();
  });
});

describe('refreshVehicleCache', () => {
  const latestEntry = {
    id: 'e1',
    data: () => ({
      abfahrt: '2026-08-04T08:00:00.000Z',
      driverName: 'Bernd Beispiel',
      defekt: true,
      counters: { km: { start: 1000, end: 1042 } },
    }),
  };

  it('schreibt Fahrt-Cache und Mängelzähler in einem Zug', async () => {
    // Beide Hälften kommen aus derselben Abfragerunde: Ein Cache, in dem der
    // Defekt der letzten Fahrt und die Mängel auseinanderlaufen, ist genau der
    // Zustand aus #706.
    latestEntryGetMock.mockResolvedValue({ docs: [latestEntry] });
    mangelQueryGetMock.mockResolvedValue({
      docs: [
        { id: 'm1', data: () => ({ status: 'resolved', entryId: 'e1' }) },
        { id: 'm2', data: () => ({ status: 'open', entryId: 'e0' }) },
      ],
    });

    await refreshVehicleCache('ffnd', 'v1');

    expect(vehicleSetMock).toHaveBeenCalledWith(
      {
        lastCounters: { km: 1042 },
        lastEntryAt: '2026-08-04T08:00:00.000Z',
        lastDriverName: 'Bernd Beispiel',
        lastEntryHasDefect: true,
        openMangelCount: 1,
        lastEntryMangelId: 'm1',
      },
      { merge: true },
    );
  });

  it('merkt sich null, wenn es zur letzten Fahrt keinen Mangel gibt', async () => {
    // Der Altbestand: Defekt an der Fahrt, kein Vorgang dazu. Nur hier bleibt
    // „Defekt gemeldet" die einzige Aussage.
    latestEntryGetMock.mockResolvedValue({ docs: [latestEntry] });
    mangelQueryGetMock.mockResolvedValue({ docs: [] });

    await refreshVehicleCache('ffnd', 'v1');

    expect(vehicleSetMock.mock.calls[0][0]).toMatchObject({
      lastEntryHasDefect: true,
      lastEntryMangelId: null,
      openMangelCount: 0,
    });
  });

  it('schreibt den leeren Cache für ein Fahrzeug ohne Fahrten', async () => {
    latestEntryGetMock.mockResolvedValue({ docs: [] });
    mangelQueryGetMock.mockResolvedValue({
      docs: [{ id: 'm1', data: () => ({ status: 'open' }) }],
    });

    await refreshVehicleCache('ffnd', 'v1');

    expect(vehicleSetMock).toHaveBeenCalledWith(
      {
        lastCounters: {},
        lastEntryAt: null,
        lastDriverName: null,
        lastEntryHasDefect: false,
        openMangelCount: 1,
        lastEntryMangelId: null,
      },
      { merge: true },
    );
  });
});
