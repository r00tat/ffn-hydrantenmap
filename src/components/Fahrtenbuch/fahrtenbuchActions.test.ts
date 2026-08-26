import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  resolveMock,
  addMock,
  vehicleGetMock,
  vehicleSetMock,
  entriesQueryGetMock,
  latestEntryGetMock,
  entryDocGetMock,
  entryDocSetMock,
  groupGetMock,
  firecallGetMock,
  firecallSetMock,
  batchSetMock,
  batchCommitMock,
  routeMock,
  actionUserRequiredMock,
  notifyMangelMock,
  createMangelForEntryMock,
  refreshVehicleCacheMock,
  personQueryGetMock,
} = vi.hoisted(() => ({
  resolveMock: vi.fn(),
  addMock: vi.fn(),
  vehicleGetMock: vi.fn(),
  vehicleSetMock: vi.fn(),
  entriesQueryGetMock: vi.fn(),
  latestEntryGetMock: vi.fn(async () => ({
    docs: [] as { data: () => unknown }[],
  })),
  entryDocGetMock: vi.fn(),
  entryDocSetMock: vi.fn(),
  groupGetMock: vi.fn(),
  firecallGetMock: vi.fn(),
  firecallSetMock: vi.fn(),
  batchSetMock: vi.fn(),
  batchCommitMock: vi.fn(),
  routeMock: vi.fn(),
  actionUserRequiredMock: vi.fn(),
  notifyMangelMock: vi.fn(),
  createMangelForEntryMock: vi.fn(),
  refreshVehicleCacheMock: vi.fn(),
  // Die Abfrage `person.userId == <uid>` der Fahrer-Ausnahme. Eigener Mock und
  // nicht der Eintrags-Mock: sonst beantwortete ein für einen Dublettentest
  // gesetzter Bestand auch die Personenfrage.
  personQueryGetMock: vi.fn(async () => ({ docs: [] as { id: string }[] })),
}));

vi.mock('../../app/auth', () => ({
  actionUserRequired: actionUserRequiredMock,
  actionAdminRequired: vi.fn(),
}));

vi.mock('../../server/auth/resolveFahrtenbuchShareLink', () => ({
  resolveFahrtenbuchShareLink: resolveMock,
}));

vi.mock('../actions/maps/routes', () => ({
  computeRouteLegsMeters: routeMock,
}));

vi.mock('./notifyMangel', () => ({ notifyMangel: notifyMangelMock }));

// Der Fahrzeug-Cache wird in `mangelStore` berechnet und dort getestet — hier
// interessiert nur, dass er nach jeder geschriebenen Fahrt aufgefrischt wird.
vi.mock('./mangelStore', () => ({
  createMangelForEntry: createMangelForEntryMock,
  refreshVehicleCache: refreshVehicleCacheMock,
}));

// Ein Firestore-Stub, der drei Kollektionen bedient: `groups` (Gruppendokument
// selbst + Subcollections `fahrtenbuch`/`vehicle`) und `call` (Einsatzdokument
// für die Routendistanz). Die Subcollection-Namen entscheiden, welche Mocks
// bedient werden — dieselbe Struktur wie im Rest der Datei zuvor, nur um das
// Gruppen- und Einsatzdokument erweitert.
vi.mock('../../server/firebase/admin', () => {
  // Der Query-Builder trägt seine Filter mit und merkt sich, ob sortiert
  // wurde. Nur so lassen sich die beiden Abfragen derselben Subcollection
  // auseinanderhalten: die Bestandsabfrage (nur `where`) und die Abfrage der
  // jüngsten Fahrt für den Fahrzeug-Cache (`orderBy`/`limit`). Ohne die
  // Trennung landete ein für einen Dublettentest gesetzter Bestandseintrag
  // auch im Cache und die Tests prüften nicht mehr, was sie behaupten.
  const query = (filters: Record<string, unknown>, ordered: boolean) => ({
    add: addMock,
    doc: () => ({ get: entryDocGetMock, set: entryDocSetMock, update: vi.fn() }),
    where: (field: string, _op: string, value: unknown) =>
      query({ ...filters, [field]: value }, ordered),
    orderBy: () => query(filters, true),
    limit: () => query(filters, true),
    get: () => (ordered ? latestEntryGetMock() : entriesQueryGetMock(filters)),
  });
  const entriesCollection = query({}, false);
  const groupDoc = {
    get: groupGetMock,
    collection: (name: string) => {
      if (name === 'vehicle') {
        return { doc: () => ({ get: vehicleGetMock, set: vehicleSetMock }) };
      }
      if (name === 'person') {
        return { where: () => ({ get: personQueryGetMock }) };
      }
      return entriesCollection;
    },
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
import type { FahrtenbuchEntryInput } from './entryLogic';
import {
  createFahrtenbuchEntries,
  createFahrtenbuchEntry,
  createFahrtenbuchEntryViaShareLink,
  deleteFahrtenbuchEntry,
  importFahrtenbuchEntries,
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
    refreshVehicleCacheMock.mockReset();
    entriesQueryGetMock.mockReset();
    firecallGetMock.mockReset();
    firecallSetMock.mockReset();
    firecallGetMock.mockResolvedValue({ exists: false });
    firecallSetMock.mockResolvedValue(undefined);

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

  it('nimmt den Namen des Einsatzes aus dem Dokument, nicht aus der Anfrage', async () => {
    // Hinter dem Gastformular steht niemand, dessen Eingabe man zurechnen
    // könnte — ein frei gesetzter Einsatzname wäre unkontrollierter Fremdinhalt
    // in einem Nachweisdokument.
    firecallGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ group: 'ffnd', name: 'Brand Hauptplatz' }),
    });

    await createFahrtenbuchEntryViaShareLink('tok', {
      ...input,
      zweck: 'einsatz',
      firecallId: 'fc1',
      firecallName: 'Untergeschoben',
    });

    const doc = addMock.mock.calls[0][0];
    expect(doc.firecallId).toBe('fc1');
    expect(doc.firecallName).toBe('Brand Hauptplatz');
  });

  it('lehnt einen Einsatz einer anderen Gruppe ab', async () => {
    firecallGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ group: 'andere', name: 'Fremder Einsatz' }),
    });

    const result = await createFahrtenbuchEntryViaShareLink('tok', {
      ...input,
      zweck: 'einsatz',
      firecallId: 'fc1',
    });

    expect(result).toEqual({ success: false, error: 'firecallInvalid' });
    expect(addMock).not.toHaveBeenCalled();
  });

  it('lehnt einen gelöschten Einsatz ab', async () => {
    firecallGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ group: 'ffnd', name: 'Brand', deleted: true }),
    });

    const result = await createFahrtenbuchEntryViaShareLink('tok', {
      ...input,
      zweck: 'einsatz',
      firecallId: 'fc1',
    });

    expect(result).toEqual({ success: false, error: 'firecallInvalid' });
  });

  it('verwirft den Einsatzbezug bei einem anderen Zweck', async () => {
    await createFahrtenbuchEntryViaShareLink('tok', {
      ...input,
      firecallId: 'fc1',
      firecallName: 'Brand',
    });
    const doc = addMock.mock.calls[0][0];
    expect(doc).not.toHaveProperty('firecallId');
    expect(doc).not.toHaveProperty('firecallName');
  });

  it('lehnt eine zweite Fahrt desselben Fahrzeugs zum selben Einsatz ab', async () => {
    // Der Gast sieht die Fahrten der Gruppe nicht und kann ein Duplikat vorher
    // nicht erkennen — die Meldung der Action ist seine einzige Warnung.
    firecallGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ group: 'ffnd', name: 'Brand' }),
    });
    entriesQueryGetMock.mockResolvedValue({
      docs: [{ id: 'e1', data: () => ({ vehicleId: 'v1' }) }],
    });

    const result = await createFahrtenbuchEntryViaShareLink('tok', {
      ...input,
      zweck: 'einsatz',
      firecallId: 'fc1',
    });

    expect(result).toMatchObject({
      success: false,
      error: 'duplicateFirecallEntry',
    });
    expect(addMock).not.toHaveBeenCalled();
  });

  it('schreibt sie nach Bestätigung', async () => {
    firecallGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ group: 'ffnd', name: 'Brand' }),
    });
    entriesQueryGetMock.mockResolvedValue({
      docs: [{ id: 'e1', data: () => ({ vehicleId: 'v1' }) }],
    });

    const result = await createFahrtenbuchEntryViaShareLink(
      'tok',
      { ...input, zweck: 'einsatz', firecallId: 'fc1' },
      { confirmDuplicate: true },
    );

    expect(result).toMatchObject({ success: true });
  });

  it('frischt den Zähler-Cache des Fahrzeugs auf', async () => {
    await createFahrtenbuchEntryViaShareLink('tok', input);
    expect(refreshVehicleCacheMock).toHaveBeenCalledWith('ffnd', 'v1');
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

  /**
   * Nur die Schreibvorgänge am Einsatz, die den Routen-Cache betreffen. An
   * dasselbe Dokument geht auch der Fahrtenzähler; ohne die Trennung prüften
   * die Cache-Tests bloß, dass überhaupt nichts geschrieben wurde.
   */
  const routeWrites = () =>
    firecallSetMock.mock.calls.filter(
      ([data]) => (data as Record<string, unknown>)?.fahrtenbuchRoute,
    );

  beforeEach(() => {
    actionUserRequiredMock.mockReset();
    vehicleGetMock.mockReset();
    vehicleSetMock.mockReset();
    refreshVehicleCacheMock.mockReset();
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
    routeMock.mockResolvedValue({ outboundMeters: 8000, returnMeters: 12000 });

    const result = await createFahrtenbuchEntries('ffnd', [
      einsatzEntry('v1'),
      einsatzEntry('v2'),
    ]);

    expect(routeMock).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.created).toBe(2);
    // 8 km Hinweg + 12 km Rückweg -> 20 km. Ein verdoppelter Hinweg ergäbe 16.
    expect(result.roundTripKm).toBe(20);
  });

  it('schreibt Hin- und Rückweg getrennt an den Eintrag', async () => {
    // Die Belegstelle im Nachweisdokument: Aus den beiden Wegstrecken lässt
    // sich der Kilometerstand nachrechnen. Ein einzelner verdoppelter Wert
    // könnte das bei einer Autobahnanfahrt nicht.
    firecallGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ group: 'ffnd', lat: 47.98, lng: 16.9 }),
    });
    routeMock.mockResolvedValue({ outboundMeters: 8000, returnMeters: 12000 });

    await createFahrtenbuchEntries('ffnd', [einsatzEntry('v1')]);

    const [, doc] = batchSetMock.mock.calls[0];
    expect(doc.routeOutboundMeters).toBe(8000);
    expect(doc.routeReturnMeters).toBe(12000);
    expect(doc).not.toHaveProperty('routeDistanceMeters');
    expect(doc.counterSources).toEqual({ km: 'route' });
    // Startstand 1000 aus `einsatzEntry` plus 20 km Gesamtstrecke.
    expect(doc.counters.km).toEqual({ start: 1000, end: 1020, diff: 20 });
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
          outboundM: 4000,
          returnM: 6000,
          from: [standort.lat, standort.lng],
          to: [einsatzort.lat, einsatzort.lng],
        },
      }),
    });

    const result = await createFahrtenbuchEntries('ffnd', [einsatzEntry('v1')]);

    expect(routeMock).not.toHaveBeenCalled();
    expect(routeWrites()).toEqual([]);
    expect(result.success).toBe(true);
    expect(result.created).toBe(1);
    // 4 km Hinweg + 6 km Rückweg aus dem Cache -> 10 km.
    expect(result.roundTripKm).toBe(10);
  });

  it('misst neu, wenn am Einsatz nur die alte einfache Strecke gecacht ist', async () => {
    // Sonst blieben Einsätze auf der Autobahn dauerhaft beim verdoppelten
    // Hinweg stehen, obwohl längst richtungsgetrennt gemessen wird.
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
    routeMock.mockResolvedValue({ outboundMeters: 5000, returnMeters: 14000 });

    const result = await createFahrtenbuchEntries('ffnd', [einsatzEntry('v1')]);

    expect(routeMock).toHaveBeenCalledTimes(1);
    expect(result.roundTripKm).toBe(19);
    // Der neue Cache trägt beide Richtungen.
    const [cacheWrite] = firecallSetMock.mock.calls[0];
    expect(cacheWrite.fahrtenbuchRoute).toMatchObject({
      outboundM: 5000,
      returnM: 14000,
    });
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

  it('schätzt die Strecke, wenn kein Routing zu bekommen ist, statt die Fahrt auszulassen', async () => {
    firecallGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ group: 'ffnd', lat: 47.98, lng: 16.9 }),
    });
    routeMock.mockResolvedValue(undefined);

    const result = await createFahrtenbuchEntries('ffnd', [
      einsatzEntry('v1'),
      einsatzEntry('v2', { counters: { km: { start: 2000, end: 2030 } } }),
    ]);

    expect(result.success).toBe(true);
    // Beide Zeilen landen im Fahrtenbuch. Früher fiel die erste aus, weil ohne
    // Route kein Endstand zu ermitteln war — die Fahrt fehlte dann ganz.
    expect(result.created).toBe(2);
    expect(result.failedVehicleIds).toEqual([]);
    expect(result.skippedVehicleIds).toEqual([]);
    // Die Meldung muss die Schätzung als solche ausweisen.
    expect(result.distanceSource).toBe('estimate');
    expect(result.roundTripKm).toBeGreaterThan(0);
    expect(batchSetMock).toHaveBeenCalledTimes(2);

    // Der Kilometerstand von v1 stammt aus der Schätzung und ist am Eintrag als
    // solcher gekennzeichnet — ohne nachprüfbare Route.
    const [, doc] = batchSetMock.mock.calls[0];
    expect(doc.counterSources).toEqual({ km: 'estimate' });
    expect(doc).not.toHaveProperty('routeOutboundMeters');
    expect(doc).not.toHaveProperty('routeReturnMeters');
    expect(doc).not.toHaveProperty('routeDistanceMeters');
  });

  it('cacht eine geschätzte Strecke nicht am Einsatz', async () => {
    // Sonst behielte ein einzelner Routing-Ausfall die Schätzung für alle
    // späteren Fahrzeuge desselben Einsatzes bei, obwohl die API längst wieder
    // antwortet.
    firecallGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ group: 'ffnd', lat: 47.98, lng: 16.9 }),
    });
    routeMock.mockResolvedValue(undefined);

    await createFahrtenbuchEntries('ffnd', [einsatzEntry('v1')]);

    expect(routeWrites()).toEqual([]);
  });

  it('meldet keine Gesamtstrecke, wenn alle Endstände von Hand eingetragen wurden', async () => {
    firecallGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ group: 'ffnd', lat: 47.98, lng: 16.9 }),
    });
    routeMock.mockResolvedValue({ outboundMeters: 8000, returnMeters: 12000 });

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
    routeMock.mockResolvedValue({ outboundMeters: 8000, returnMeters: 12000 });
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
    // v3 hat zu diesem Einsatz schon einen Eintrag.
    entriesQueryGetMock.mockResolvedValue({
      docs: [{ data: () => ({ vehicleId: 'v3', counters: {} }) }],
    });

    const result = await createFahrtenbuchEntries('ffnd', [
      einsatzEntry('v3'), // schon erfasst -> übersprungen
      // Unlesbare Abfahrt: ein widersprüchlicher Wert, kein fehlender — den
      // lehnt die Validierung weiterhin ab.
      einsatzEntry('v1', { abfahrt: 'sofort' }),
    ]);

    expect(result.success).toBe(true);
    expect(result.created).toBe(0);
    // Nicht geschrieben heißt nicht „schon erfasst": Die Zeile gehört in das
    // eigene Feld, sonst meldete die Oberfläche eine fehlende Fahrt als
    // bereits gebucht.
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
    routeOutboundMeters: 8000,
    routeReturnMeters: 9000,
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
    refreshVehicleCacheMock.mockReset();
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

  it('behält die Herkunft, wenn der Endstand des Zählers unverändert bleibt, und übernimmt beide Wegstrecken', async () => {
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
    expect(doc.routeOutboundMeters).toBe(8000);
    expect(doc.routeReturnMeters).toBe(9000);
  });

  it('verwirft die Herkunft, wenn der Endstand von Hand geändert wird, behält aber die Wegstrecken', async () => {
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
    expect(doc.routeOutboundMeters).toBe(8000);
    expect(doc.routeReturnMeters).toBe(9000);
  });

  it('führt das alte routeDistanceMeters eines vorbestehenden Eintrags weiter', async () => {
    // Einträge aus der Zeit der verdoppelten einfachen Strecke tragen nur
    // dieses Feld. Verlöre es eine Bearbeitung, stünde ein als `'route'`
    // ausgewiesener Zählerstand ohne jede Belegstelle da.
    entryDocGetMock.mockResolvedValue({
      exists: true,
      data: () => ({
        ...existingEntry,
        routeOutboundMeters: undefined,
        routeReturnMeters: undefined,
        routeDistanceMeters: 8000,
      }),
    });

    const result = await updateFahrtenbuchEntry('ffnd', 'e1', {
      vehicleId: 'v1',
      driverName: 'Max Mustermann',
      zweck: 'einsatz',
      firecallId: 'f1',
      firecallName: 'Brand',
      ziel: 'Bahnhof',
      abfahrt: existingEntry.abfahrt,
      ankunft: existingEntry.ankunft,
      counters: { km: { start: 1000, end: 1020 } },
    });

    expect(result.success).toBe(true);
    const doc = entryDocSetMock.mock.calls[0][0];
    expect(doc.counterSources).toEqual({ km: 'route' });
    expect(doc.routeDistanceMeters).toBe(8000);
    expect(doc).not.toHaveProperty('routeOutboundMeters');
  });
});

describe('importFahrtenbuchEntries', () => {
  function importInput(
    overrides: Partial<FahrtenbuchEntryInput> = {},
  ): FahrtenbuchEntryInput {
    return {
      vehicleId: 'v1',
      driverName: 'Anna Muster',
      zweck: 'einsatz',
      ziel: 'N/S Ölspur',
      // Ortszeit, weil die Dublettenregel am Kalendertag hängt: eine
      // UTC-Angabe kurz vor Mitternacht fiele sonst auf den Vortag.
      abfahrt: new Date(2025, 5, 4, 17, 40).toISOString(),
      ankunft: new Date(2025, 5, 4, 18, 0).toISOString(),
      counters: { km: { start: 14646, end: 14664 } },
      ...overrides,
    };
  }

  /** Ein Bestandseintrag, wie ihn die Bestandsabfrage des Imports liefert. */
  const existingDoc = (
    entry: Partial<{
      vehicleId: string;
      abfahrt: string;
      counters: Record<string, { start?: number; end?: number }>;
    }> = {},
  ) => ({
    data: () => ({
      vehicleId: 'v1',
      abfahrt: new Date(2025, 5, 4, 9, 0).toISOString(),
      counters: { km: { start: 14646, end: 14664 } },
      deleted: false,
      ...entry,
    }),
  });

  beforeEach(() => {
    actionUserRequiredMock.mockReset();
    vehicleGetMock.mockReset();
    vehicleSetMock.mockReset();
    refreshVehicleCacheMock.mockReset();
    entriesQueryGetMock.mockReset();
    latestEntryGetMock.mockClear();
    batchSetMock.mockReset();
    batchCommitMock.mockReset();
    routeMock.mockReset();
    groupGetMock.mockReset();

    actionUserRequiredMock.mockResolvedValue(SESSION);
    vehicleGetMock.mockResolvedValue({
      exists: true,
      id: 'v1',
      data: () => KM_VEHICLE,
    });
    entriesQueryGetMock.mockResolvedValue({ docs: [] });
    batchCommitMock.mockResolvedValue(undefined);
    vehicleSetMock.mockResolvedValue(undefined);
  });

  it('überspringt eine bereits vorhandene Zeile', async () => {
    // Bestand: gleiche Fahrt (Fahrzeug, Tag, Startstand) liegt schon vor —
    // nur zu einer anderen Uhrzeit, wie beim zweiten Lauf derselben Datei.
    entriesQueryGetMock.mockResolvedValue({ docs: [existingDoc()] });

    const result = await importFahrtenbuchEntries('ffnd', [importInput()]);

    expect(result).toMatchObject({ success: true, created: 0, duplicates: 1 });
    expect(batchSetMock).not.toHaveBeenCalled();
    expect(batchCommitMock).not.toHaveBeenCalled();
    // Ohne geschriebene Zeile darf auch der Fahrzeug-Cache nicht angefasst
    // werden.
    expect(refreshVehicleCacheMock).not.toHaveBeenCalled();
  });

  it('fragt den Bestand je Fahrzeug ab und trennt die Fahrzeuge dabei', async () => {
    // Nur v1 hat die Fahrt schon; die gleichlautende Zeile von v2 ist neu.
    entriesQueryGetMock.mockImplementation(
      async (filters: Record<string, unknown>) => ({
        docs: filters.vehicleId === 'v1' ? [existingDoc()] : [],
      }),
    );

    const result = await importFahrtenbuchEntries('ffnd', [
      importInput(),
      importInput({ vehicleId: 'v2' }),
    ]);

    expect(result).toMatchObject({ created: 1, duplicates: 1 });
    expect(entriesQueryGetMock).toHaveBeenCalledWith(
      expect.objectContaining({ vehicleId: 'v1', deleted: false }),
    );
    expect(entriesQueryGetMock).toHaveBeenCalledWith(
      expect.objectContaining({ vehicleId: 'v2', deleted: false }),
    );
  });

  it('schreibt neue Zeilen und frischt den Fahrzeug-Cache einmal auf', async () => {
    const result = await importFahrtenbuchEntries('ffnd', [
      importInput({ abfahrt: new Date(2025, 5, 4, 8, 0).toISOString() }),
      importInput({
        abfahrt: new Date(2025, 5, 5, 8, 0).toISOString(),
        ankunft: new Date(2025, 5, 5, 8, 30).toISOString(),
        counters: { km: { start: 14664, end: 14700 } },
      }),
    ]);

    expect(result).toMatchObject({
      success: true,
      created: 2,
      duplicates: 0,
      failed: 0,
    });
    expect(batchSetMock).toHaveBeenCalledTimes(2);
    expect(batchCommitMock).toHaveBeenCalledTimes(1);
    // Beide Zeilen gehören demselben Fahrzeug — der Cache wird erst nach dem
    // Schreiben und nur einmal neu berechnet.
    expect(refreshVehicleCacheMock).toHaveBeenCalledTimes(1);
  });

  it('erkennt eine doppelt enthaltene Zeile innerhalb desselben Aufrufs', async () => {
    const result = await importFahrtenbuchEntries('ffnd', [
      importInput(),
      importInput(),
    ]);

    expect(result).toMatchObject({ created: 1, duplicates: 1 });
    expect(batchSetMock).toHaveBeenCalledTimes(1);
  });

  it('schreibt zwei Fahrten eines Fahrzeugs ohne Kilometerzähler am selben Tag', async () => {
    // Anhänger oder Boot: ohne Startkilometerstand gibt es keinen
    // Dublettenschlüssel. Zwei Fahrten am selben Tag sind hier normal — sie
    // stillschweigend zu einer zusammenzufassen wäre der schlechtere Fehler.
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

    const bootInput = (start: number, end: number, hour: number) =>
      importInput({
        vehicleId: 'boot',
        abfahrt: new Date(2025, 5, 4, hour, 0).toISOString(),
        ankunft: new Date(2025, 5, 4, hour + 1, 0).toISOString(),
        counters: { betriebsstundenBb: { start, end } },
      });

    const result = await importFahrtenbuchEntries('ffnd', [
      bootInput(20, 22, 8),
      bootInput(22, 24, 14),
    ]);

    expect(result).toMatchObject({
      success: true,
      created: 2,
      duplicates: 0,
      failed: 0,
    });
  });

  it('lässt eine Zeile ohne Endstand aus, statt sie aufzufüllen', async () => {
    const result = await importFahrtenbuchEntries('ffnd', [
      importInput({ counters: { km: { start: 14646 } } }),
      importInput({
        abfahrt: new Date(2025, 5, 5, 8, 0).toISOString(),
        ankunft: new Date(2025, 5, 5, 8, 30).toISOString(),
        counters: { km: { start: 14664, end: 14700 } },
      }),
    ]);

    expect(result).toMatchObject({ created: 1, duplicates: 0, failed: 1 });
    // Ein aus einer Route errechneter Endstand wäre bei einer Fahrt von vor
    // zwei Jahren eine erfundene Angabe — es darf gar nicht erst geroutet
    // werden.
    expect(routeMock).not.toHaveBeenCalled();
    expect(batchSetMock).toHaveBeenCalledTimes(1);
  });

  it('schreibt keine Herkunftsangabe an importierte Zählerstände', async () => {
    await importFahrtenbuchEntries('ffnd', [importInput()]);

    const doc = batchSetMock.mock.calls[0][1];
    // Importierte Stände sind abgelesen, nicht abgeleitet.
    expect(doc).not.toHaveProperty('counterSources');
    expect(doc).not.toHaveProperty('routeOutboundMeters');
    expect(doc).not.toHaveProperty('routeReturnMeters');
    expect(doc.counters.km).toMatchObject({ start: 14646, end: 14664 });
    expect(doc.group).toBe('ffnd');
    expect(doc.deleted).toBe(false);
  });

  it('verteilt mehr Zeilen als ein Batch fasst auf mehrere Commits', async () => {
    const inputs = Array.from({ length: 250 }, (_, index) =>
      importInput({
        counters: { km: { start: 10000 + index, end: 10010 + index } },
      }),
    );

    const result = await importFahrtenbuchEntries('ffnd', inputs);

    expect(result).toMatchObject({ success: true, created: 250 });
    expect(batchCommitMock).toHaveBeenCalledTimes(2);
    expect(refreshVehicleCacheMock).toHaveBeenCalledTimes(1);
  });

  it('meldet einen gescheiterten Block, ohne den bereits geschriebenen zu verschweigen', async () => {
    const inputs = Array.from({ length: 250 }, (_, index) =>
      importInput({
        counters: { km: { start: 10000 + index, end: 10010 + index } },
      }),
    );
    // Der erste Block ist geschrieben, der zweite fällt aus.
    batchCommitMock
      .mockImplementationOnce(async () => undefined)
      .mockImplementationOnce(async () => {
        throw new Error('5 UNAVAILABLE: backend unavailable');
      });

    const result = await importFahrtenbuchEntries('ffnd', inputs);

    // „Nichts importiert" wäre hier die gefährliche Meldung: Der Benutzer
    // startete den Import neu, und jede Zeile ohne Startkilometerstand stünde
    // danach doppelt im Fahrtenbuch.
    expect(result).toMatchObject({
      success: true,
      created: 200,
      duplicates: 0,
      failed: 50,
    });
    // Die 200 committeten Zeilen gehören in den Fahrzeug-Cache.
    expect(refreshVehicleCacheMock).toHaveBeenCalledTimes(1);
  });

  it('hält nach einem gescheiterten Block die folgenden nicht auf', async () => {
    const inputs = Array.from({ length: 450 }, (_, index) =>
      importInput({
        counters: { km: { start: 10000 + index, end: 10010 + index } },
      }),
    );
    batchCommitMock
      .mockImplementationOnce(async () => {
        throw new Error('5 UNAVAILABLE: backend unavailable');
      })
      .mockImplementation(async () => undefined);

    const result = await importFahrtenbuchEntries('ffnd', inputs);

    expect(result).toMatchObject({ success: true, created: 250, failed: 200 });
    expect(batchCommitMock).toHaveBeenCalledTimes(3);
  });

  it('meldet den Import trotz gescheitertem Fahrzeug-Cache als erfolgreich', async () => {
    // Der Cache ist ein abgeleiteter Wert — die Fahrten stehen schon im
    // Fahrtenbuch und dürfen nicht als verloren gemeldet werden.
    refreshVehicleCacheMock.mockRejectedValueOnce(new Error('5 UNAVAILABLE'));

    const result = await importFahrtenbuchEntries('ffnd', [importInput()]);

    expect(result).toMatchObject({ success: true, created: 1 });
  });

  it('weist mehr als 1000 Zeilen ab, ohne etwas zu schreiben', async () => {
    const inputs = Array.from({ length: 1001 }, (_, index) =>
      importInput({
        counters: { km: { start: 10000 + index, end: 10010 + index } },
      }),
    );

    const result = await importFahrtenbuchEntries('ffnd', inputs);

    expect(result).toMatchObject({ success: false, error: 'tooManyEntries' });
    expect(batchSetMock).not.toHaveBeenCalled();
  });

  it('kommt mit einer leeren Eingabe zurecht, ohne Fahrzeuge zu laden', async () => {
    const result = await importFahrtenbuchEntries('ffnd', []);

    expect(result).toEqual({
      success: true,
      created: 0,
      duplicates: 0,
      failed: 0,
    });
    expect(vehicleGetMock).not.toHaveBeenCalled();
  });

  it('weist ein Nichtmitglied ab', async () => {
    actionUserRequiredMock.mockResolvedValueOnce({
      user: { ...SESSION.user, groups: ['andere-feuerwehr'] },
    });

    const result = await importFahrtenbuchEntries('ffnd', [importInput()]);

    expect(result).toMatchObject({ success: false, error: 'notInGroup' });
    expect(batchSetMock).not.toHaveBeenCalled();
  });
});

describe('Mangel-Benachrichtigung', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionUserRequiredMock.mockResolvedValue(SESSION);
    resolveMock.mockResolvedValue({
      token: 'tok',
      groupId: 'ffnd',
      linkId: 'abc123def456',
    });
    vehicleGetMock.mockResolvedValue({
      exists: true,
      id: 'v1',
      data: () => KM_VEHICLE,
    });
    addMock.mockResolvedValue({ id: 'e1' });
    latestEntryGetMock.mockResolvedValue({ docs: [] });
    notifyMangelMock.mockResolvedValue(true);
  });

  it('benachrichtigt bei einer neu erfassten Fahrt mit Defekt', async () => {
    const result = await createFahrtenbuchEntry('ffnd', {
      ...input,
      defekt: true,
      mangel: 'Bremse schleift',
    });

    expect(result).toMatchObject({ success: true, id: 'e1' });
    expect(notifyMangelMock).toHaveBeenCalledTimes(1);
    const args = notifyMangelMock.mock.calls[0][0];
    expect(args.groupId).toBe('ffnd');
    expect(args.entry).toMatchObject({
      defekt: true,
      mangel: 'Bremse schleift',
      vehicleId: 'v1',
    });
    // Kennzeichen und Zähler-Bezeichnungen stehen nur in den Stammdaten.
    expect(args.vehicle).toMatchObject({ name: 'RLFA 2000' });
  });

  it('benachrichtigt nicht, wenn kein Defekt gemeldet wurde', async () => {
    await createFahrtenbuchEntry('ffnd', input);
    expect(notifyMangelMock).not.toHaveBeenCalled();
  });

  it('meldet die Fahrt als gespeichert, obwohl die Mail scheitert', async () => {
    // Die Fahrt steht im Fahrtenbuch. Ein Fehler hier würde den Benutzer dazu
    // bringen, sie ein zweites Mal einzutragen.
    notifyMangelMock.mockRejectedValue(new Error('SMTP kaputt'));

    const result = await createFahrtenbuchEntry('ffnd', {
      ...input,
      defekt: true,
      mangel: 'Bremse schleift',
    });

    expect(result).toMatchObject({ success: true, id: 'e1' });
  });

  it('benachrichtigt auch bei einer Meldung über den Freigabelink', async () => {
    const result = await createFahrtenbuchEntryViaShareLink('tok', {
      ...input,
      defekt: true,
      mangel: 'Bremse schleift',
    });

    expect(result).toMatchObject({ success: true, id: 'e1' });
    expect(notifyMangelMock).toHaveBeenCalledTimes(1);
    expect(notifyMangelMock.mock.calls[0][0].entry.createdBy).toBe(
      'share:abc123def456',
    );
  });

  it('benachrichtigt nicht beim Bearbeiten einer bereits defekten Fahrt', async () => {
    entryDocGetMock.mockResolvedValue({
      exists: true,
      data: () => ({
        vehicleId: 'v1',
        deleted: false,
        createdBy: 'u1',
        createdByName: 'Max Mustermann',
        createdAt: '2026-08-04T08:00:00.000Z',
        counters: { km: { start: 1200, end: 1250 } },
        defekt: true,
      }),
    });

    const result = await updateFahrtenbuchEntry('ffnd', 'e1', {
      ...input,
      defekt: true,
      mangel: 'Bremse schleift, Ergänzung',
    });

    expect(result).toMatchObject({ success: true });
    expect(notifyMangelMock).not.toHaveBeenCalled();
  });

  it('benachrichtigt nicht beim Import', async () => {
    entriesQueryGetMock.mockResolvedValue({ docs: [] });
    batchCommitMock.mockResolvedValue(undefined);

    const result = await importFahrtenbuchEntries('ffnd', [
      {
        ...input,
        defekt: true,
        mangel: 'Bremse schleift',
      } as FahrtenbuchEntryInput,
    ]);

    expect(result).toMatchObject({ success: true, created: 1 });
    expect(notifyMangelMock).not.toHaveBeenCalled();
  });
});

describe('Mangel aus einer Fahrt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionUserRequiredMock.mockResolvedValue(SESSION);
    resolveMock.mockResolvedValue({
      token: 'tok',
      groupId: 'ffnd',
      linkId: 'abc123def456',
    });
    vehicleGetMock.mockResolvedValue({
      exists: true,
      id: 'v1',
      data: () => KM_VEHICLE,
    });
    addMock.mockResolvedValue({ id: 'e1' });
    latestEntryGetMock.mockResolvedValue({ docs: [] });
    notifyMangelMock.mockResolvedValue(true);
    createMangelForEntryMock.mockResolvedValue('m1');
  });

  it('legt zur Fahrt mit Defekt einen Mangel an', async () => {
    const result = await createFahrtenbuchEntry('ffnd', {
      ...input,
      defekt: true,
      mangel: 'Bremse schleift',
    });

    expect(result).toMatchObject({ success: true, id: 'e1' });
    expect(createMangelForEntryMock).toHaveBeenCalledTimes(1);
    const args = createMangelForEntryMock.mock.calls[0][0];
    expect(args).toMatchObject({ groupId: 'ffnd', entryId: 'e1' });
    expect(args.entry).toMatchObject({
      defekt: true,
      mangel: 'Bremse schleift',
      vehicleId: 'v1',
    });
    expect(args.actor.userId).toBe('u1');
  });

  it('legt ohne Defekt keinen Mangel an', async () => {
    await createFahrtenbuchEntry('ffnd', input);
    expect(createMangelForEntryMock).not.toHaveBeenCalled();
  });

  it('meldet die Fahrt als gespeichert, obwohl der Mangel scheitert', async () => {
    // Dieselbe Haltung wie bei der Mail: Die Fahrt steht im Fahrtenbuch, ein
    // Fehler im Folgeschritt darf sie nicht als gescheitert melden.
    createMangelForEntryMock.mockRejectedValue(new Error('Firestore kaputt'));

    const result = await createFahrtenbuchEntry('ffnd', {
      ...input,
      defekt: true,
      mangel: 'Bremse schleift',
    });

    expect(result).toMatchObject({ success: true, id: 'e1' });
  });

  it('legt auch über den Freigabelink einen Mangel an', async () => {
    await createFahrtenbuchEntryViaShareLink('tok', {
      ...input,
      defekt: true,
      mangel: 'Bremse schleift',
    });

    expect(createMangelForEntryMock).toHaveBeenCalledTimes(1);
    // Derselbe Actor wie am Eintrag — die nicht geheime `linkId`, nie der Token.
    expect(createMangelForEntryMock.mock.calls[0][0].actor.userId).toBe(
      'share:abc123def456',
    );
  });

  it('legt beim Bearbeiten keinen zweiten Mangel an', async () => {
    // Ab der Meldung hat der Mangel sein eigenes Leben. Eine Korrektur an der
    // Fahrt darf ihn weder verdoppeln noch zurücksetzen.
    entryDocGetMock.mockResolvedValue({
      exists: true,
      data: () => ({
        vehicleId: 'v1',
        deleted: false,
        createdBy: 'u1',
        createdByName: 'Max Mustermann',
        createdAt: '2026-08-04T08:00:00.000Z',
        counters: { km: { start: 1200, end: 1250 } },
        defekt: true,
      }),
    });

    const result = await updateFahrtenbuchEntry('ffnd', 'e1', {
      ...input,
      defekt: true,
      mangel: 'Bremse schleift, Ergänzung',
    });

    expect(result).toMatchObject({ success: true });
    expect(createMangelForEntryMock).not.toHaveBeenCalled();
  });

  it('legt beim Import keinen Mangel an', async () => {
    // Eine Fahrt von vor zwei Jahren löst keinen Werkstatttermin mehr aus.
    entriesQueryGetMock.mockResolvedValue({ docs: [] });
    batchCommitMock.mockResolvedValue(undefined);

    const result = await importFahrtenbuchEntries('ffnd', [
      { ...input, defekt: true, mangel: 'Bremse schleift' } as FahrtenbuchEntryInput,
    ]);

    expect(result).toMatchObject({ success: true, created: 1 });
    expect(createMangelForEntryMock).not.toHaveBeenCalled();
  });
});

describe('Duplikat: dieselbe Fahrt zweimal zu einem Einsatz', () => {
  const einsatzInput = {
    ...input,
    zweck: 'einsatz' as const,
    firecallId: 'f1',
    firecallName: 'Brand Hauptplatz',
  };

  beforeEach(() => {
    actionUserRequiredMock.mockReset();
    vehicleGetMock.mockReset();
    vehicleSetMock.mockReset();
    entriesQueryGetMock.mockReset();
    latestEntryGetMock.mockReset();
    entryDocGetMock.mockReset();
    entryDocSetMock.mockReset();
    firecallGetMock.mockReset();
    firecallSetMock.mockReset();
    addMock.mockReset();
    notifyMangelMock.mockReset();
    createMangelForEntryMock.mockReset();

    actionUserRequiredMock.mockResolvedValue(SESSION);
    vehicleGetMock.mockResolvedValue({
      exists: true,
      id: 'v1',
      data: () => KM_VEHICLE,
    });
    latestEntryGetMock.mockResolvedValue({ docs: [] });
    addMock.mockResolvedValue({ id: 'e2' });
    firecallGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ group: 'ffnd' }),
    });
    firecallSetMock.mockResolvedValue(undefined);
    entriesQueryGetMock.mockResolvedValue({ docs: [] });
  });

  /** Ein bestehender Eintrag desselben Einsatzes, wie ihn die Abfrage liefert. */
  const existingForFirecall = (id: string, vehicleId: string) => ({
    docs: [{ id, data: () => ({ vehicleId, firecallId: 'f1', deleted: false }) }],
  });

  it('lehnt eine zweite Fahrt desselben Fahrzeugs zum selben Einsatz ab', async () => {
    entriesQueryGetMock.mockResolvedValue(existingForFirecall('e1', 'v1'));

    const result = await createFahrtenbuchEntry('ffnd', einsatzInput);

    expect(result).toMatchObject({
      success: false,
      error: 'duplicateFirecallEntry',
    });
    expect(addMock).not.toHaveBeenCalled();
  });

  it('schreibt sie nach ausdrücklicher Bestätigung', async () => {
    entriesQueryGetMock.mockResolvedValue(existingForFirecall('e1', 'v1'));

    const result = await createFahrtenbuchEntry('ffnd', einsatzInput, {
      confirmDuplicate: true,
    });

    expect(result).toMatchObject({ success: true, id: 'e2' });
    expect(addMock).toHaveBeenCalledTimes(1);
  });

  it('lässt ein anderes Fahrzeug zum selben Einsatz durch', async () => {
    entriesQueryGetMock.mockResolvedValue(existingForFirecall('e1', 'v9'));

    const result = await createFahrtenbuchEntry('ffnd', einsatzInput);

    expect(result).toMatchObject({ success: true });
  });

  it('prüft nicht ohne verknüpften Einsatz', async () => {
    // Eine Übung trägt keine Einsatzverknüpfung — hier gibt es kein Duplikat
    // in diesem Sinn, und eine Abfrage wäre überflüssig.
    entriesQueryGetMock.mockResolvedValue(existingForFirecall('e1', 'v1'));

    const result = await createFahrtenbuchEntry('ffnd', input);

    expect(result).toMatchObject({ success: true });
  });

  it('meldet beim Bearbeiten nicht die Fahrt selbst', async () => {
    entryDocGetMock.mockResolvedValue({
      exists: true,
      data: () => ({
        ...einsatzInput,
        vehicleName: 'RLFA 2000',
        group: 'ffnd',
        deleted: false,
        createdBy: 'u1',
        createdByName: 'Max Mustermann',
        createdAt: '2026-08-04T07:00:00.000Z',
      }),
    });
    entryDocSetMock.mockResolvedValue(undefined);
    entriesQueryGetMock.mockResolvedValue(existingForFirecall('e1', 'v1'));

    const result = await updateFahrtenbuchEntry('ffnd', 'e1', einsatzInput);

    expect(result).toMatchObject({ success: true, id: 'e1' });
  });

  it('lehnt beim Bearbeiten ein Verschieben auf eine belegte Kombination ab', async () => {
    entryDocGetMock.mockResolvedValue({
      exists: true,
      data: () => ({
        ...einsatzInput,
        vehicleName: 'RLFA 2000',
        group: 'ffnd',
        deleted: false,
        createdBy: 'u1',
        createdByName: 'Max Mustermann',
        createdAt: '2026-08-04T07:00:00.000Z',
      }),
    });
    entryDocSetMock.mockResolvedValue(undefined);
    // Eine andere Fahrt belegt die Kombination schon.
    entriesQueryGetMock.mockResolvedValue(existingForFirecall('e7', 'v1'));

    const result = await updateFahrtenbuchEntry('ffnd', 'e1', einsatzInput);

    expect(result).toMatchObject({
      success: false,
      error: 'duplicateFirecallEntry',
    });
    expect(entryDocSetMock).not.toHaveBeenCalled();
  });
});

describe('Fahrtenzähler am Einsatz', () => {
  const einsatzInput = {
    ...input,
    zweck: 'einsatz' as const,
    firecallId: 'f1',
    firecallName: 'Brand Hauptplatz',
  };

  beforeEach(() => {
    actionUserRequiredMock.mockReset();
    vehicleGetMock.mockReset();
    vehicleSetMock.mockReset();
    entriesQueryGetMock.mockReset();
    latestEntryGetMock.mockReset();
    firecallGetMock.mockReset();
    firecallSetMock.mockReset();
    addMock.mockReset();
    notifyMangelMock.mockReset();
    createMangelForEntryMock.mockReset();

    actionUserRequiredMock.mockResolvedValue(SESSION);
    vehicleGetMock.mockResolvedValue({
      exists: true,
      id: 'v1',
      data: () => KM_VEHICLE,
    });
    latestEntryGetMock.mockResolvedValue({ docs: [] });
    addMock.mockResolvedValue({ id: 'e2' });
    firecallSetMock.mockResolvedValue(undefined);
  });

  it('schreibt die Anzahl der Fahrten an den Einsatz', async () => {
    firecallGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ group: 'ffnd' }),
    });
    // Erst der Duplikatscheck (leer), dann die Zählung nach dem Schreiben.
    entriesQueryGetMock
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValue({
        docs: [
          { id: 'e2', data: () => ({ vehicleId: 'v1' }) },
          { id: 'e3', data: () => ({ vehicleId: 'v2' }) },
        ],
      });

    const result = await createFahrtenbuchEntry('ffnd', einsatzInput);

    expect(result).toMatchObject({ success: true });
    expect(firecallSetMock).toHaveBeenCalledWith(
      { fahrtenbuchEntryCount: 2 },
      { merge: true },
    );
  });

  it('schreibt nicht an einen Einsatz einer anderen Gruppe', async () => {
    // Der Guard der Action prüft nur die eigene Gruppenmitgliedschaft, nicht
    // wem der Einsatz gehört.
    firecallGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ group: 'andere' }),
    });
    entriesQueryGetMock.mockResolvedValue({ docs: [] });

    const result = await createFahrtenbuchEntry('ffnd', einsatzInput);

    expect(result).toMatchObject({ success: true });
    expect(firecallSetMock).not.toHaveBeenCalled();
  });

  it('lässt die Fahrt stehen, wenn der Zähler nicht geschrieben werden kann', async () => {
    // Der Zähler ist eine Anzeigehilfe. Ein Fehler dort darf die erfasste
    // Fahrt nicht mitnehmen.
    firecallGetMock.mockRejectedValue(new Error('Firestore weg'));
    entriesQueryGetMock.mockResolvedValue({ docs: [] });

    const result = await createFahrtenbuchEntry('ffnd', einsatzInput);

    expect(result).toMatchObject({ success: true, id: 'e2' });
  });
});

describe('Gerätemeister korrigiert fremde Einträge', () => {
  const foreignEntry = {
    vehicleId: 'v1',
    driverName: 'Anna Bauer',
    zweck: 'uebung' as const,
    ziel: 'Zeughaus',
    abfahrt: '2026-08-05T08:00:00.000Z',
    ankunft: '2026-08-05T09:00:00.000Z',
    counters: { km: { start: 1000, end: 1020, diff: 20 } },
    group: 'ffnd',
    deleted: false,
    createdAt: '2026-08-05T09:05:00.000Z',
    createdBy: 'someoneElse',
    createdByName: 'Anna Bauer',
    updatedAt: '2026-08-05T09:05:00.000Z',
    updatedBy: 'someoneElse',
  };

  const geraetemeisterSession = {
    user: {
      id: 'g1',
      name: 'Max Mustermann',
      email: 'max@ffn.at',
      isAdmin: false,
      groups: ['ffnd'],
      fahrtenbuchGeraetemeister: ['ffnd'],
    },
  };

  beforeEach(() => {
    actionUserRequiredMock.mockReset();
    vehicleGetMock.mockReset();
    vehicleSetMock.mockReset();
    refreshVehicleCacheMock.mockReset();
    entriesQueryGetMock.mockReset();
    entryDocGetMock.mockReset();
    entryDocSetMock.mockReset();

    vehicleGetMock.mockResolvedValue({
      exists: true,
      id: 'v1',
      data: () => KM_VEHICLE,
    });
    entriesQueryGetMock.mockResolvedValue({ docs: [] });
    entryDocGetMock.mockResolvedValue({
      exists: true,
      data: () => foreignEntry,
    });
    entryDocSetMock.mockResolvedValue(undefined);
  });

  it('lässt den Gerätemeister einen fremden Eintrag ändern', async () => {
    actionUserRequiredMock.mockResolvedValue(geraetemeisterSession);

    const result = await updateFahrtenbuchEntry('ffnd', 'e1', input);

    expect(result.success).toBe(true);
    expect(entryDocSetMock).toHaveBeenCalled();
  });

  it('weist ein einfaches Gruppenmitglied bei einem fremden Eintrag ab', async () => {
    // SESSION ist u1 ohne Adminrecht und ohne Gerätemeister-Eintrag.
    actionUserRequiredMock.mockResolvedValue(SESSION);

    const result = await updateFahrtenbuchEntry('ffnd', 'e1', input);

    expect(result).toEqual({ success: false, error: 'notAllowed' });
    expect(entryDocSetMock).not.toHaveBeenCalled();
  });

  it('lässt den Gerätemeister einen fremden Eintrag löschen', async () => {
    actionUserRequiredMock.mockResolvedValue(geraetemeisterSession);

    const result = await deleteFahrtenbuchEntry('ffnd', 'e1');

    expect(result).toEqual({ success: true, id: 'e1' });
  });

  it('weist ein einfaches Gruppenmitglied beim Löschen ab', async () => {
    actionUserRequiredMock.mockResolvedValue(SESSION);

    const result = await deleteFahrtenbuchEntry('ffnd', 'e1');

    expect(result).toEqual({ success: false, error: 'notAllowed' });
  });

  it('schreibt den Namen des Änderers mit', async () => {
    actionUserRequiredMock.mockResolvedValue(geraetemeisterSession);

    await updateFahrtenbuchEntry('ffnd', 'e1', input);

    expect(entryDocSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        updatedBy: 'g1',
        updatedByName: 'Max Mustermann',
        // Der Ersteller bleibt der ursprüngliche — geändert hat nur jemand
        // anderer, und beides muss nebeneinander lesbar bleiben.
        createdBy: 'someoneElse',
        createdByName: 'Anna Bauer',
      }),
      { merge: false },
    );
  });
});

describe('Fahrer korrigiert seine über den QR-Code erfasste Fahrt', () => {
  /** Erfasst hinter dem Freigabe-Link: kein Ersteller, nur die Link-ID. */
  const sharedEntry = {
    vehicleId: 'v1',
    driverId: 'p1',
    driverName: 'Max Mustermann',
    zweck: 'uebung' as const,
    ziel: 'Landesfeuerwehrschule',
    abfahrt: '2026-08-05T08:00:00.000Z',
    ankunft: '2026-08-05T09:00:00.000Z',
    counters: { km: { start: 1000, end: 1020, diff: 20 } },
    group: 'ffnd',
    deleted: false,
    createdAt: '2026-08-05T09:05:00.000Z',
    createdBy: 'share:0516d6a8494d',
    createdByName: 'Max Mustermann',
    updatedAt: '2026-08-05T09:05:00.000Z',
    updatedBy: 'share:0516d6a8494d',
  };

  const otherMemberSession = {
    user: {
      id: 'u2',
      name: 'Anna Bauer',
      email: 'anna@ffn.at',
      isAdmin: false,
      groups: ['ffnd'],
    },
  };

  const geraetemeisterSessionForShare = {
    user: {
      ...otherMemberSession.user,
      fahrtenbuchGeraetemeister: ['ffnd'],
    },
  };

  beforeEach(() => {
    actionUserRequiredMock.mockReset();
    vehicleGetMock.mockReset();
    entriesQueryGetMock.mockReset();
    entryDocGetMock.mockReset();
    entryDocSetMock.mockReset();
    personQueryGetMock.mockReset();
    refreshVehicleCacheMock.mockReset();

    vehicleGetMock.mockResolvedValue({
      exists: true,
      id: 'v1',
      data: () => KM_VEHICLE,
    });
    entriesQueryGetMock.mockResolvedValue({ docs: [] });
    entryDocGetMock.mockResolvedValue({
      exists: true,
      data: () => sharedEntry,
    });
    entryDocSetMock.mockResolvedValue(undefined);
    personQueryGetMock.mockResolvedValue({ docs: [] });
  });

  it('lässt den über person.userId verknüpften Fahrer ändern', async () => {
    actionUserRequiredMock.mockResolvedValue(otherMemberSession);
    personQueryGetMock.mockResolvedValue({ docs: [{ id: 'p1' }] });

    const result = await updateFahrtenbuchEntry('ffnd', 'e1', input);

    expect(result.success).toBe(true);
  });

  it('weist ein Mitglied ohne gepflegte Verknüpfung ab', async () => {
    // SESSION heißt „Max Mustermann" wie der eingetragene Fahrer. Der
    // Anzeigename gehört dem Benutzer selbst (Freitext bei der
    // Selbstregistrierung, danach über `updateProfile` änderbar) und darf
    // deshalb keine Berechtigung begründen.
    actionUserRequiredMock.mockResolvedValue(SESSION);

    const result = await updateFahrtenbuchEntry('ffnd', 'e1', input);

    expect(result).toEqual({ success: false, error: 'notAllowed' });
    expect(entryDocSetMock).not.toHaveBeenCalled();
  });

  it('weist ein fremdes Mitglied mit anderer Verknüpfung ab', async () => {
    actionUserRequiredMock.mockResolvedValue(otherMemberSession);
    personQueryGetMock.mockResolvedValue({ docs: [{ id: 'p2' }] });

    const result = await updateFahrtenbuchEntry('ffnd', 'e1', input);

    expect(result).toEqual({ success: false, error: 'notAllowed' });
    expect(entryDocSetMock).not.toHaveBeenCalled();
  });

  it('lässt den verknüpften Fahrer seine Fahrt auch löschen', async () => {
    actionUserRequiredMock.mockResolvedValue(otherMemberSession);
    personQueryGetMock.mockResolvedValue({ docs: [{ id: 'p1' }] });

    const result = await deleteFahrtenbuchEntry('ffnd', 'e1');

    expect(result).toEqual({ success: true, id: 'e1' });
  });

  it('fragt die Personen-Verknüpfung beim Ersteller nicht ab', async () => {
    // Der Lesevorgang lohnt nur, wo er etwas ändern kann.
    actionUserRequiredMock.mockResolvedValue(geraetemeisterSessionForShare);

    await updateFahrtenbuchEntry('ffnd', 'e1', input);

    expect(personQueryGetMock).not.toHaveBeenCalled();
  });
});
