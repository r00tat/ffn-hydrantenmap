import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../../app/auth', () => ({
  actionUserRequired: vi.fn(),
  actionAdminRequired: vi.fn(),
}));

const { resolveMock, addMock, vehicleGetMock, vehicleSetMock, entriesQueryGetMock } =
  vi.hoisted(() => ({
    resolveMock: vi.fn(),
    addMock: vi.fn(),
    vehicleGetMock: vi.fn(),
    vehicleSetMock: vi.fn(),
    entriesQueryGetMock: vi.fn(),
  }));

vi.mock('../../server/auth/resolveFahrtenbuchShareLink', () => ({
  resolveFahrtenbuchShareLink: resolveMock,
}));

// Ein Firestore-Stub, der beide Subcollections bedient: `fahrtenbuch` (add +
// Query für den Zähler-Cache) und `vehicle` (get + set).
vi.mock('../../server/firebase/admin', () => {
  const entriesCollection = {
    add: addMock,
    doc: () => ({ get: vi.fn(), set: vi.fn(), update: vi.fn() }),
    where: () => entriesCollection,
    orderBy: () => entriesCollection,
    limit: () => entriesCollection,
    get: entriesQueryGetMock,
  };
  return {
    firestore: {
      collection: () => ({
        doc: () => ({
          collection: (name: string) =>
            name === 'vehicle'
              ? { doc: () => ({ get: vehicleGetMock, set: vehicleSetMock }) }
              : entriesCollection,
        }),
      }),
      batch: () => ({ set: vi.fn(), commit: vi.fn() }),
    },
  };
});

import { createFahrtenbuchEntryViaShareLink } from './fahrtenbuchActions';
import { ApiException } from '../../app/api/errors';

const input = {
  vehicleId: 'v1',
  driverId: 'p1',
  driverName: 'Max Mustermann',
  zweck: 'uebung' as const,
  ziel: 'Zeughaus',
  abfahrt: '2026-08-04T08:00:00.000Z',
  ankunft: '2026-08-04T09:00:00.000Z',
  counters: { km: { start: 1200, end: 1250 } },
};

describe('createFahrtenbuchEntryViaShareLink', () => {
  beforeEach(() => {
    resolveMock.mockReset();
    addMock.mockReset();
    vehicleGetMock.mockReset();
    vehicleSetMock.mockReset();
    entriesQueryGetMock.mockReset();

    resolveMock.mockResolvedValue({
      token: 'tok',
      groupId: 'ffnd',
      linkId: 'abc123def456',
    });
    vehicleGetMock.mockResolvedValue({
      exists: true,
      id: 'v1',
      data: () => ({
        name: 'TLF',
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
      }),
    });
    addMock.mockResolvedValue({ id: 'e1' });
    entriesQueryGetMock.mockResolvedValue({ docs: [] });
  });

  it('legt den Eintrag mit dem Share-Actor an', async () => {
    const result = await createFahrtenbuchEntryViaShareLink('tok', input);
    expect(result).toMatchObject({ success: true, id: 'e1' });

    const doc = addMock.mock.calls[0][0];
    // Die nicht geheime `linkId`, nie der Token: `createdBy` ist für jedes
    // Gruppenmitglied lesbar.
    expect(doc.createdBy).toBe('share:abc123def456');
    expect(doc.createdBy).not.toContain('tok');
    expect(doc.updatedBy).toBe('share:abc123def456');
    expect(doc.updatedBy).not.toContain('tok');
    expect(doc.createdByName).toBe('Max Mustermann');
    expect(doc.vehicleName).toBe('TLF');
    expect(doc.group).toBe('ffnd');
    expect(doc.deleted).toBe(false);
  });

  it('schreibt keinen Einsatzbezug, auch wenn einer mitgeschickt wird', async () => {
    await createFahrtenbuchEntryViaShareLink('tok', {
      ...input,
      zweck: 'einsatz',
      firecallId: 'fc1',
      firecallName: 'Brand',
    });
    const doc = addMock.mock.calls[0][0];
    expect(doc).not.toHaveProperty('firecallId');
    expect(doc).not.toHaveProperty('firecallName');
  });

  it('frischt den Zähler-Cache des Fahrzeugs auf', async () => {
    await createFahrtenbuchEntryViaShareLink('tok', input);
    expect(vehicleSetMock).toHaveBeenCalled();
  });

  it('lehnt einen ungültigen Token mit dem Schlüssel linkInvalid ab', async () => {
    resolveMock.mockRejectedValueOnce(
      new ApiException('share link invalid', { status: 404 }),
    );
    await expect(createFahrtenbuchEntryViaShareLink('tok', input)).resolves.toEqual({
      success: false,
      error: 'linkInvalid',
    });
    expect(addMock).not.toHaveBeenCalled();
  });

  // Ein anonymer Aufrufer darf aus der Antwort weder die Gruppen-ID noch
  // gültige Fahrzeug-IDs ablesen können.
  it('meldet ein unbekanntes Fahrzeug ohne interne Details', async () => {
    vehicleGetMock.mockResolvedValue({ exists: false, id: 'v9', data: () => undefined });
    const result = await createFahrtenbuchEntryViaShareLink('tok', {
      ...input,
      vehicleId: 'v9',
    });
    expect(result).toEqual({ success: false, error: 'vehicleNotFound' });
    expect(result.error).not.toMatch(/not found|invalid fahrtenbuch/);
    expect(addMock).not.toHaveBeenCalled();
  });

  it('meldet einen Validierungsfehler ohne interne Details', async () => {
    const result = await createFahrtenbuchEntryViaShareLink('tok', {
      ...input,
      abfahrt: '2026-08-04T09:00:00.000Z',
      ankunft: '2026-08-04T08:00:00.000Z',
    });
    expect(result).toEqual({ success: false, error: 'invalidEntry' });
    expect(result.error).not.toMatch(/not found|invalid fahrtenbuch/);
    expect(addMock).not.toHaveBeenCalled();
  });

  it('meldet einen unerwarteten Fehler nur als shareSaveFailed', async () => {
    addMock.mockRejectedValueOnce(new Error('5 NOT_FOUND: no such collection ffnd'));
    const result = await createFahrtenbuchEntryViaShareLink('tok', input);
    expect(result).toEqual({ success: false, error: 'shareSaveFailed' });
    expect(result.error).not.toMatch(/ffnd|NOT_FOUND/);
  });
});
