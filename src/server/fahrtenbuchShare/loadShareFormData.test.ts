import { beforeEach, describe, expect, it, vi } from 'vitest';

// `server-only` wirft außerhalb einer Server-Umgebung.
vi.mock('server-only', () => ({}));

const { groupGetMock, vehicleGetMock, personGetMock, firecallGetMock } =
  vi.hoisted(() => ({
    groupGetMock: vi.fn(),
    vehicleGetMock: vi.fn(),
    personGetMock: vi.fn(),
    firecallGetMock: vi.fn(),
  }));

// Zwei Kollektionen: `groups` mit dem Gruppendokument und seinen
// Subcollections, und `call` als Abfrage über die letzten Einsätze.
vi.mock('../firebase/admin', () => {
  const firecallQuery: Record<string, unknown> = {
    where: () => firecallQuery,
    orderBy: () => firecallQuery,
    limit: () => firecallQuery,
    get: () => firecallGetMock(),
  };
  return {
    firestore: {
      collection: (name: string) =>
        name === 'call'
          ? firecallQuery
          : {
              doc: () => ({
                get: groupGetMock,
                collection: (id: string) => ({
                  get: id === 'vehicle' ? vehicleGetMock : personGetMock,
                }),
              }),
            },
    },
  };
});

import { loadShareFormData } from './loadShareFormData';

const snapshot = (docs: Record<string, unknown>[]) => ({
  docs: docs.map(({ id, ...data }) => ({ id, data: () => data })),
});

const AUDIT = {
  createdAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'u1',
  updatedAt: '2026-01-02T00:00:00.000Z',
  updatedBy: 'u2',
};

describe('loadShareFormData', () => {
  beforeEach(() => {
    groupGetMock.mockReset();
    vehicleGetMock.mockReset();
    personGetMock.mockReset();
    firecallGetMock.mockReset();
    firecallGetMock.mockResolvedValue(snapshot([]));
    groupGetMock.mockResolvedValue({ data: () => ({ name: 'FF Neusiedl' }) });
    vehicleGetMock.mockResolvedValue(snapshot([]));
    personGetMock.mockResolvedValue(snapshot([]));
  });

  // Die Regression: `vehicle.active` statt `active !== false` hätte ein
  // Dokument ohne das Feld nur auf der Gastseite verschwinden lassen.
  it('zeigt ein Fahrzeug ohne active-Feld weiterhin an', async () => {
    vehicleGetMock.mockResolvedValue(
      snapshot([
        { id: 'v1', name: 'TLF', counters: [], fuelTypes: ['diesel'], ...AUDIT },
      ]),
    );
    const data = await loadShareFormData('ffnd');
    expect(data.vehicles.map((v) => v.id)).toEqual(['v1']);
  });

  it('zeigt eine Person ohne active-Feld weiterhin an', async () => {
    personGetMock.mockResolvedValue(
      snapshot([{ id: 'p1', name: 'Max Mustermann', ...AUDIT }]),
    );
    const data = await loadShareFormData('ffnd');
    expect(data.persons).toEqual([{ id: 'p1', name: 'Max Mustermann' }]);
  });

  it('filtert deaktivierte Fahrzeuge heraus', async () => {
    vehicleGetMock.mockResolvedValue(
      snapshot([
        {
          id: 'v1',
          name: 'TLF',
          active: true,
          counters: [],
          fuelTypes: [],
          ...AUDIT,
        },
        {
          id: 'v2',
          name: 'KDO',
          active: false,
          counters: [],
          fuelTypes: [],
          ...AUDIT,
        },
      ]),
    );
    const data = await loadShareFormData('ffnd');
    expect(data.vehicles.map((v) => v.id)).toEqual(['v1']);
  });

  it('filtert deaktivierte Personen heraus', async () => {
    personGetMock.mockResolvedValue(
      snapshot([
        { id: 'p1', name: 'Aktiv', active: true, ...AUDIT },
        { id: 'p2', name: 'Ausgetreten', active: false, ...AUDIT },
      ]),
    );
    const data = await loadShareFormData('ffnd');
    expect(data.persons.map((p) => p.id)).toEqual(['p1']);
  });

  it('gibt von Personen nur id und name weiter', async () => {
    personGetMock.mockResolvedValue(
      snapshot([
        {
          id: 'p1',
          name: 'Max Mustermann',
          active: true,
          phone: '+43 664 1234567',
          email: 'max@example.org',
          note: 'Interne Notiz',
          userId: 'firebase-uid',
          blaulichtSmsRecipientId: 'bls-1',
          ...AUDIT,
        },
      ]),
    );
    const data = await loadShareFormData('ffnd');
    expect(data.persons).toEqual([{ id: 'p1', name: 'Max Mustermann' }]);
    expect(Object.keys(data.persons[0])).toEqual(['id', 'name']);
  });

  it('gibt von Fahrzeugen keine Audit- und internen Felder weiter', async () => {
    vehicleGetMock.mockResolvedValue(
      snapshot([
        {
          id: 'v1',
          name: 'TLF',
          kennzeichen: 'ND-1',
          active: true,
          counters: [],
          fuelTypes: ['diesel'],
          lastCounters: { km: 1200 },
          lastDriverName: 'Max Mustermann',
          lastEntryHasDefect: true,
          kostenersatzVehicleId: 'ke-1',
          sortOrder: 1,
          ...AUDIT,
        },
      ]),
    );
    const data = await loadShareFormData('ffnd');
    expect(Object.keys(data.vehicles[0]).sort()).toEqual([
      'counters',
      'fuelTypes',
      'id',
      'kennzeichen',
      'lastCounters',
      'name',
    ]);
  });

  it('übernimmt den Gruppennamen aus dem Gruppendokument', async () => {
    const data = await loadShareFormData('ffnd');
    expect(data.groupName).toBe('FF Neusiedl');
  });

  // Kein Rückfall auf die groupId: die interne Dokument-ID hat auf einer
  // anmeldefreien Seite nichts verloren.
  it('liefert einen leeren Gruppennamen, wenn das Gruppendokument fehlt', async () => {
    groupGetMock.mockResolvedValue({ data: () => undefined });
    const data = await loadShareFormData('ffnd');
    expect(data.groupName).toBe('');
  });

  it('sortiert Fahrzeuge nach Kategorie und darin alphabetisch', async () => {
    // Wie in der App: `sortOrder` spielt für die Anzeige keine Rolle mehr,
    // sonst stünde die Gastseite anders sortiert da als das Fahrtenbuch.
    vehicleGetMock.mockResolvedValue(
      snapshot([
        {
          id: 'v3',
          name: 'MTF',
          active: true,
          counters: [],
          fuelTypes: [],
          sortOrder: 2,
          ...AUDIT,
        },
        {
          id: 'v4',
          name: 'ATS-Anhänger',
          active: true,
          counters: [],
          fuelTypes: [],
          kategorie: 'anhaenger',
          sortOrder: 0,
          ...AUDIT,
        },
        {
          id: 'v1',
          name: 'TLF',
          active: true,
          counters: [],
          fuelTypes: [],
          sortOrder: 1,
          ...AUDIT,
        },
        {
          id: 'v2',
          name: 'KDO',
          active: true,
          counters: [],
          fuelTypes: [],
          sortOrder: 1,
          ...AUDIT,
        },
      ]),
    );
    const data = await loadShareFormData('ffnd');
    expect(data.vehicles.map((v) => v.name)).toEqual([
      'KDO',
      'MTF',
      'TLF',
      'ATS-Anhänger',
    ]);
    // Die Kategorie geht mit auf die Gastseite, damit dort dieselbe
    // Gruppierung möglich ist.
    expect(data.vehicles.at(-1)?.kategorie).toBe('anhaenger');
  });

  it('gibt von Einsätzen nur Name und Zeiten weiter', async () => {
    // Koordinaten, Beschreibung und Alarm-IDen haben hinter einem
    // anmeldefreien Link nichts zu suchen.
    firecallGetMock.mockResolvedValue(
      snapshot([
        {
          id: 'f1',
          name: 'Brand B2',
          date: '2026-08-03T10:00:00.000Z',
          abruecken: '2026-08-03T12:00:00.000Z',
          description: 'Vollbrand Dachstuhl',
          lat: 47.98,
          lng: 16.9,
          group: 'ffnd',
          blaulichtSmsAlarmIds: ['a1'],
        },
      ]),
    );
    const data = await loadShareFormData('ffnd');
    expect(data.firecalls).toEqual([
      {
        id: 'f1',
        name: 'Brand B2',
        date: '2026-08-03T10:00:00.000Z',
        abruecken: '2026-08-03T12:00:00.000Z',
      },
    ]);
  });
});
