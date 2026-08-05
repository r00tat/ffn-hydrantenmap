import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  resolveMock,
  addMock,
  vehicleGetMock,
  vehicleSetMock,
  entriesQueryGetMock,
  entryDocGetMock,
  entryDocSetMock,
  groupGetMock,
  firecallGetMock,
  firecallSetMock,
  batchSetMock,
  batchCommitMock,
  routeMock,
  actionUserRequiredMock,
} = vi.hoisted(() => ({
  resolveMock: vi.fn(),
  addMock: vi.fn(),
  vehicleGetMock: vi.fn(),
  vehicleSetMock: vi.fn(),
  entriesQueryGetMock: vi.fn(),
  entryDocGetMock: vi.fn(),
  entryDocSetMock: vi.fn(),
  groupGetMock: vi.fn(),
  firecallGetMock: vi.fn(),
  firecallSetMock: vi.fn(),
  batchSetMock: vi.fn(),
  batchCommitMock: vi.fn(),
  routeMock: vi.fn(),
  actionUserRequiredMock: vi.fn(),
}));

vi.mock('../../app/auth', () => ({
  actionUserRequired: actionUserRequiredMock,
  actionAdminRequired: vi.fn(),
}));

vi.mock('../../server/auth/resolveFahrtenbuchShareLink', () => ({
  resolveFahrtenbuchShareLink: resolveMock,
}));

vi.mock('../actions/maps/routes', () => ({
  computeRouteDistanceMeters: routeMock,
}));

// Ein Firestore-Stub, der drei Kollektionen bedient: `groups` (Gruppendokument
// selbst + Subcollections `fahrtenbuch`/`vehicle`) und `call` (Einsatzdokument
// für die Routendistanz). Die Subcollection-Namen entscheiden, welche Mocks
// bedient werden — dieselbe Struktur wie im Rest der Datei zuvor, nur um das
// Gruppen- und Einsatzdokument erweitert.
vi.mock('../../server/firebase/admin', () => {
  const entriesCollection = {
    add: addMock,
    doc: () => ({ get: entryDocGetMock, set: entryDocSetMock, update: vi.fn() }),
    where: () => entriesCollection,
    orderBy: () => entriesCollection,
    limit: () => entriesCollection,
    get: entriesQueryGetMock,
  };
  const groupDoc = {
    get: groupGetMock,
    collection: (name: string) =>
      name === 'vehicle'
        ? { doc: () => ({ get: vehicleGetMock, set: vehicleSetMock }) }
        : entriesCollection,
  };
  const firecallDoc = { get: firecallGetMock, set: firecallSetMock };
  return {
    firestore: {
      collection: (name: string) =>
        name === 'call' ? { doc: () => firecallDoc } : { doc: () => groupDoc },
      batch: () => ({ set: batchSetMock, commit: batchCommitMock }),
    },
  };
});

import { ApiException } from '../../app/api/errors';
import {
  createFahrtenbuchEntries,
  createFahrtenbuchEntryViaShareLink,
  updateFahrtenbuchEntry,
} from './fahrtenbuchActions';

const KM_VEHICLE = {
  name: 'RLFA 2000',
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
  fuelTypes: [],
};

const SESSION = {
  user: {
    id: 'u1',
    name: 'Max Mustermann',
    email: 'max@ffn.at',
    isAdmin: false,
    groups: ['ffnd'],
  },
};

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

describe('createFahrtenbuchEntries — Route zum Einsatzort', () => {
  const einsatzEntry = (
    vehicleId: string,
    // Die Zähler bleiben bewusst offen getypt: Ein Boot bringt andere Zähler
    // mit als der Kilometerstand aus `input`.
    overrides: Partial<Omit<typeof input, 'counters'>> & {
      counters?: Record<string, { start?: number; end?: number }>;
    } = {},
  ) => ({
    vehicleId,
    driverId: 'p1',
    driverName: 'Max Mustermann',
    zweck: 'einsatz' as const,
    firecallId: 'f1',
    firecallName: 'Brand Hauptplatz',
    ziel: 'Hauptplatz',
    abfahrt: '2026-08-05T08:00:00.000Z',
    ankunft: '2026-08-05T09:00:00.000Z',
    counters: { km: { start: 1000 } },
    ...overrides,
  });

  beforeEach(() => {
    actionUserRequiredMock.mockReset();
    vehicleGetMock.mockReset();
    vehicleSetMock.mockReset();
    entriesQueryGetMock.mockReset();
    entryDocGetMock.mockReset();
    entryDocSetMock.mockReset();
    groupGetMock.mockReset();
    firecallGetMock.mockReset();
    firecallSetMock.mockReset();
    batchSetMock.mockReset();
    batchCommitMock.mockReset();
    routeMock.mockReset();

    actionUserRequiredMock.mockResolvedValue(SESSION);
    // Kein gepflegter Standort — die Action muss auf `defaultPosition`
    // zurückfallen, nicht auf undefined koordinaten.
    groupGetMock.mockResolvedValue({ data: () => ({}) });
    vehicleGetMock.mockResolvedValue({
      exists: true,
      id: 'vehicle',
      data: () => KM_VEHICLE,
    });
    entriesQueryGetMock.mockResolvedValue({ docs: [] });
    firecallSetMock.mockResolvedValue(undefined);
  });

  it('ermittelt die Distanz genau einmal, auch wenn mehrere Fahrzeuge desselben Einsatzes gespeichert werden', async () => {
    firecallGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ group: 'ffnd', lat: 47.98, lng: 16.9 }),
    });
    routeMock.mockResolvedValue(10000);

    const result = await createFahrtenbuchEntries('ffnd', [
      einsatzEntry('v1'),
      einsatzEntry('v2'),
    ]);

    expect(routeMock).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.created).toBe(2);
    // 10000 m einfache Strecke -> 20000 m Rundstrecke -> 20 km.
    expect(result.roundTripKm).toBe(20);
  });

  it('verwendet einen Cache-Treffer am Einsatz-Dokument statt neu zu routen', async () => {
    const standort = { lat: 47.9482913, lng: 16.848222 }; // defaultPosition
    const einsatzort = { lat: 47.98, lng: 16.9 };
    firecallGetMock.mockResolvedValue({
      exists: true,
      data: () => ({
        group: 'ffnd',
        lat: einsatzort.lat,
        lng: einsatzort.lng,
        fahrtenbuchRoute: {
          distanceM: 5000,
          from: [standort.lat, standort.lng],
          to: [einsatzort.lat, einsatzort.lng],
        },
      }),
    });

    const result = await createFahrtenbuchEntries('ffnd', [einsatzEntry('v1')]);

    expect(routeMock).not.toHaveBeenCalled();
    expect(firecallSetMock).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.created).toBe(1);
    // 5000 m einfache Strecke -> 10 km Rundstrecke.
    expect(result.roundTripKm).toBe(10);
  });

  it('routet und beschreibt das Einsatz-Dokument nicht bei einem Einsatz einer fremden Gruppe', async () => {
    firecallGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ group: 'andere-gruppe', lat: 47.98, lng: 16.9 }),
    });

    const result = await createFahrtenbuchEntries('ffnd', [
      // Von Hand eingetragene Kilometer — der Eintrag darf trotzdem
      // gespeichert werden, nur eben nicht über die Route.
      einsatzEntry('v1', { counters: { km: { start: 1000, end: 1010 } } }),
    ]);

    expect(routeMock).not.toHaveBeenCalled();
    expect(firecallSetMock).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.created).toBe(1);
  });

  it('überspringt eine Zeile ohne Kilometerstand bei ausgefallenem Routing, speichert eine Zeile mit von Hand erfassten Kilometern im selben Aufruf', async () => {
    firecallGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ group: 'ffnd', lat: 47.98, lng: 16.9 }),
    });
    routeMock.mockResolvedValue(undefined);

    const result = await createFahrtenbuchEntries('ffnd', [
      einsatzEntry('v1'), // kein Endstand, Routing liefert nichts -> unvollständig
      einsatzEntry('v2', { counters: { km: { start: 2000, end: 2030 } } }),
    ]);

    expect(result.success).toBe(true);
    expect(result.created).toBe(1);
    // Nicht geschrieben heißt nicht „schon erfasst": Die Zeile gehört in das
    // eigene Feld, sonst meldete die Oberfläche eine fehlende Fahrt als
    // bereits gebucht.
    expect(result.failedVehicleIds).toEqual(['v1']);
    expect(result.skippedVehicleIds).toEqual([]);
    // Nur die tatsächlich geschriebene Zeile darf den Fahrzeug-Cache
    // auffrischen und in den Batch gelangen.
    expect(batchSetMock).toHaveBeenCalledTimes(1);
    expect(batchCommitMock).toHaveBeenCalledTimes(1);
    expect(vehicleSetMock).toHaveBeenCalledTimes(1);
  });

  it('meldet keine Gesamtstrecke, wenn alle Endstände von Hand eingetragen wurden', async () => {
    firecallGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ group: 'ffnd', lat: 47.98, lng: 16.9 }),
    });
    routeMock.mockResolvedValue(10000);

    const result = await createFahrtenbuchEntries('ffnd', [
      einsatzEntry('v1', { counters: { km: { start: 1000, end: 1005 } } }),
    ]);

    expect(result.created).toBe(1);
    // Die Route wurde zwar aufgelöst, ging aber in keinen Zählerstand ein —
    // „20 km je Fahrzeug" wäre eine Behauptung über fremde Zahlen.
    expect(result.roundTripKm).toBeUndefined();
  });

  it('meldet keine Gesamtstrecke für ein Fahrzeug ohne Kilometerzähler', async () => {
    firecallGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ group: 'ffnd', lat: 47.98, lng: 16.9 }),
    });
    routeMock.mockResolvedValue(10000);
    vehicleGetMock.mockResolvedValue({
      exists: true,
      id: 'boot',
      data: () => ({
        name: 'MZB',
        counters: [
          {
            id: 'betriebsstundenBb',
            label: 'Betriebsstunden',
            unit: 'h',
            mode: 'startEnd',
            changeWarning: 'decrease',
            required: true,
          },
        ],
        fuelTypes: [],
      }),
    });

    const result = await createFahrtenbuchEntries('ffnd', [
      einsatzEntry('boot', { counters: { betriebsstundenBb: { start: 20 } } }),
    ]);

    expect(result.created).toBe(1);
    expect(result.roundTripKm).toBeUndefined();
  });

  it('trennt ein bereits erfasstes Fahrzeug von einer nicht schreibbaren Zeile', async () => {
    firecallGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ group: 'ffnd', lat: 47.98, lng: 16.9 }),
    });
    routeMock.mockResolvedValue(undefined);
    // v3 hat zu diesem Einsatz schon einen Eintrag.
    entriesQueryGetMock.mockResolvedValue({
      docs: [{ data: () => ({ vehicleId: 'v3', counters: {} }) }],
    });

    const result = await createFahrtenbuchEntries('ffnd', [
      einsatzEntry('v3'), // schon erfasst -> übersprungen
      einsatzEntry('v1'), // kein Endstand, kein Routing -> fehlgeschlagen
    ]);

    expect(result.success).toBe(true);
    expect(result.created).toBe(0);
    expect(result.skippedVehicleIds).toEqual(['v3']);
    expect(result.failedVehicleIds).toEqual(['v1']);
  });
});

describe('updateFahrtenbuchEntry — Herkunft abgeleiteter Zählerstände', () => {
  const existingEntry = {
    vehicleId: 'v1',
    driverName: 'Max Mustermann',
    zweck: 'einsatz' as const,
    firecallId: 'f1',
    firecallName: 'Brand',
    ziel: 'Hauptplatz',
    abfahrt: '2026-08-05T08:00:00.000Z',
    ankunft: '2026-08-05T09:00:00.000Z',
    counters: { km: { start: 1000, end: 1020, diff: 20 } },
    counterSources: { km: 'route' as const },
    routeDistanceMeters: 8000,
    group: 'ffnd',
    deleted: false,
    createdAt: '2026-08-05T09:05:00.000Z',
    createdBy: 'u1',
    createdByName: 'Max Mustermann',
    updatedAt: '2026-08-05T09:05:00.000Z',
    updatedBy: 'u1',
  };

  beforeEach(() => {
    actionUserRequiredMock.mockReset();
    vehicleGetMock.mockReset();
    vehicleSetMock.mockReset();
    entriesQueryGetMock.mockReset();
    entryDocGetMock.mockReset();
    entryDocSetMock.mockReset();

    actionUserRequiredMock.mockResolvedValue(SESSION);
    vehicleGetMock.mockResolvedValue({
      exists: true,
      id: 'v1',
      data: () => KM_VEHICLE,
    });
    entriesQueryGetMock.mockResolvedValue({ docs: [] });
    entryDocGetMock.mockResolvedValue({
      exists: true,
      data: () => existingEntry,
    });
    entryDocSetMock.mockResolvedValue(undefined);
  });

  it('behält die Herkunft, wenn der Endstand des Zählers unverändert bleibt, und übernimmt die Routendistanz', async () => {
    const result = await updateFahrtenbuchEntry('ffnd', 'e1', {
      vehicleId: 'v1',
      driverName: 'Max Mustermann',
      zweck: 'einsatz',
      firecallId: 'f1',
      firecallName: 'Brand',
      ziel: 'Bahnhof', // andere Feldänderung, Endstand bleibt gleich
      abfahrt: existingEntry.abfahrt,
      ankunft: existingEntry.ankunft,
      counters: { km: { start: 1000, end: 1020 } },
    });

    expect(result.success).toBe(true);
    const doc = entryDocSetMock.mock.calls[0][0];
    expect(doc.counterSources).toEqual({ km: 'route' });
    expect(doc.routeDistanceMeters).toBe(8000);
  });

  it('verwirft die Herkunft, wenn der Endstand von Hand geändert wird, behält aber die Routendistanz', async () => {
    const result = await updateFahrtenbuchEntry('ffnd', 'e1', {
      vehicleId: 'v1',
      driverName: 'Max Mustermann',
      zweck: 'einsatz',
      firecallId: 'f1',
      firecallName: 'Brand',
      ziel: 'Hauptplatz',
      abfahrt: existingEntry.abfahrt,
      ankunft: existingEntry.ankunft,
      counters: { km: { start: 1000, end: 1050 } },
    });

    expect(result.success).toBe(true);
    const doc = entryDocSetMock.mock.calls[0][0];
    expect(doc).not.toHaveProperty('counterSources');
    expect(doc.routeDistanceMeters).toBe(8000);
  });
});
