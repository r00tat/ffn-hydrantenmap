import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { addMock, mangelQueryGetMock, vehicleSetMock } = vi.hoisted(() => ({
  addMock: vi.fn(),
  mangelQueryGetMock: vi.fn(),
  vehicleSetMock: vi.fn(),
}));

vi.mock('../../server/firebase/admin', () => {
  const mangelCollection = {
    add: addMock,
    doc: () => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }),
    where: () => mangelCollection,
    get: mangelQueryGetMock,
  };
  const groupDoc = {
    collection: (name: string) =>
      name === 'vehicle'
        ? { doc: () => ({ get: vi.fn(), set: vehicleSetMock }) }
        : mangelCollection,
  };
  return { firestore: { collection: () => ({ doc: () => groupDoc }) } };
});

import type { FahrtenbuchEntry } from '../../common/fahrtenbuch';
import { createMangelForEntry } from './mangelStore';

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
    docs: [{ data: () => ({ status: 'open' }) }],
  });
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
        { data: () => ({ status: 'open' }) },
        { data: () => ({ status: 'resolved' }) },
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
      { openMangelCount: 1 },
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
