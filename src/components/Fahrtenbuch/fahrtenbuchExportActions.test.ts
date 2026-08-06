import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  actionUserRequiredMock,
  groupGetMock,
  vehiclesGetMock,
  entriesGetMock,
  filterSpy,
} = vi.hoisted(() => ({
  actionUserRequiredMock: vi.fn(),
  groupGetMock: vi.fn(),
  vehiclesGetMock: vi.fn(),
  entriesGetMock: vi.fn(),
  filterSpy: vi.fn(),
}));

vi.mock('../../app/auth', () => ({
  actionUserRequired: actionUserRequiredMock,
  actionAdminRequired: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  // Wie im Modelltest: Schlüssel und Werte wörtlich, damit die Zuordnung
  // sichtbar bleibt.
  getTranslations: async () => (key: string, values?: Record<string, unknown>) =>
    values
      ? `${key}(${Object.entries(values)
          .map(([k, v]) => `${k}=${v}`)
          .join(',')})`
      : key,
}));

vi.mock('../../server/firebase/admin', () => {
  const entriesQuery = {
    where: (field: string, op: string, value: unknown) => {
      filterSpy(field, op, value);
      return entriesQuery;
    },
    orderBy: () => entriesQuery,
    limit: () => entriesQuery,
    get: () => entriesGetMock(),
  };
  const groupDoc = {
    get: groupGetMock,
    collection: (name: string) =>
      name === 'vehicle' ? { get: vehiclesGetMock } : entriesQuery,
  };
  return {
    firestore: { collection: () => ({ doc: () => groupDoc }) },
  };
});

import { ApiException } from '../../app/api/errors';
import { VEHICLE_PRESETS, type FahrtenbuchEntry } from '../../common/fahrtenbuch';
import { exportFahrtenbuchPdf } from './fahrtenbuchExportActions';

const SESSION = {
  user: {
    id: 'u1',
    name: 'Paul Wölfel',
    isAdmin: false,
    groups: ['ffnd'],
  },
};

const VEHICLE = {
  name: 'RLFA 2000',
  kennzeichen: 'FW-100ND',
  active: true,
  counters: VEHICLE_PRESETS.fahrzeug,
  fuelTypes: ['diesel'],
  sortOrder: 1,
};

function entry(overrides: Partial<FahrtenbuchEntry> = {}) {
  return {
    vehicleId: 'v1',
    vehicleName: 'RLFA 2000',
    driverName: 'Max Mustermann',
    zweck: 'einsatz',
    ziel: 'N/S Ölspur',
    abfahrt: '2025-06-08T06:45:00.000Z',
    ankunft: '2025-06-08T08:00:00.000Z',
    counters: { km: { start: 14664, end: 14672, diff: 8 } },
    group: 'ffnd',
    deleted: false,
    ...overrides,
  };
}

function docs(items: Record<string, unknown>[], ids: string[]) {
  return {
    docs: items.map((data, i) => ({ id: ids[i], data: () => data })),
  };
}

const request = {
  groupId: 'ffnd',
  from: '2025-06-01',
  to: '2025-06-30',
  vehicleIds: ['v1'],
  timeZone: 'Europe/Vienna',
};

describe('exportFahrtenbuchPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionUserRequiredMock.mockResolvedValue(SESSION);
    groupGetMock.mockResolvedValue({ data: () => ({ name: 'FF Neusiedl' }) });
    vehiclesGetMock.mockResolvedValue(docs([VEHICLE], ['v1']));
    entriesGetMock.mockResolvedValue(docs([entry()], ['e1']));
  });

  it('liefert ein PDF mit Dateinamen und Fahrtenzahl', async () => {
    const result = await exportFahrtenbuchPdf(request);

    expect(result.success).toBe(true);
    expect(result.fileName).toBe(
      'Fahrtenbuch_FF_Neusiedl_2025-06-01_2025-06-30.pdf',
    );
    expect(result.entryCount).toBe(1);
    expect(
      Buffer.from(result.pdfBase64 as string, 'base64')
        .subarray(0, 5)
        .toString('latin1'),
    ).toBe('%PDF-');
  });

  it('fragt den Zeitraum mit den Tagesgrenzen der Zeitzone ab', async () => {
    await exportFahrtenbuchPdf(request);

    expect(filterSpy).toHaveBeenCalledWith('deleted', '==', false);
    expect(filterSpy).toHaveBeenCalledWith(
      'abfahrt',
      '>=',
      '2025-05-31T22:00:00.000Z',
    );
    expect(filterSpy).toHaveBeenCalledWith(
      'abfahrt',
      '<=',
      '2025-06-30T21:59:59.999Z',
    );
  });

  it('nimmt nur die Fahrten der gewählten Fahrzeuge auf', async () => {
    vehiclesGetMock.mockResolvedValue(
      docs([VEHICLE, { ...VEHICLE, name: 'MTF', sortOrder: 2 }], ['v1', 'v2']),
    );
    entriesGetMock.mockResolvedValue(
      docs([entry(), entry({ vehicleId: 'v2' })], ['e1', 'e2']),
    );

    const result = await exportFahrtenbuchPdf(request);

    expect(result.success).toBe(true);
    // Nur „v1" war gewählt, also auch nur dessen Fahrt.
    expect(result.entryCount).toBe(1);
  });

  it('weist einen ungültigen Zeitraum ab', async () => {
    await expect(
      exportFahrtenbuchPdf({ ...request, from: '2025-07-01' }),
    ).resolves.toEqual({ success: false, error: 'exportRangeInvalid' });
    await expect(
      exportFahrtenbuchPdf({ ...request, to: '30.06.2025' }),
    ).resolves.toEqual({ success: false, error: 'exportRangeInvalid' });
  });

  it('weist eine leere Auswahl ab', async () => {
    await expect(
      exportFahrtenbuchPdf({ ...request, vehicleIds: [] }),
    ).resolves.toEqual({ success: false, error: 'exportNoVehicles' });
  });

  it('weist eine Auswahl ab, zu der es kein Fahrzeug mehr gibt', async () => {
    vehiclesGetMock.mockResolvedValue(docs([], []));

    await expect(exportFahrtenbuchPdf(request)).resolves.toEqual({
      success: false,
      error: 'exportNoVehicles',
    });
  });

  it('lehnt einen zu großen Zeitraum ab, statt ihn zu kürzen', async () => {
    entriesGetMock.mockResolvedValue(
      docs(
        Array.from({ length: 5001 }, () => entry()),
        Array.from({ length: 5001 }, (_, i) => `e${i}`),
      ),
    );

    await expect(exportFahrtenbuchPdf(request)).resolves.toEqual({
      success: false,
      error: 'exportTooLarge',
    });
  });

  it('übersetzt eine fehlende Gruppenmitgliedschaft in einen Fehlerschlüssel', async () => {
    actionUserRequiredMock.mockResolvedValue({
      user: { ...SESSION.user, groups: ['andere'] },
    });

    await expect(exportFahrtenbuchPdf(request)).resolves.toEqual({
      success: false,
      error: 'notInGroup',
    });
  });

  it('übersetzt eine fehlende Anmeldung in einen Fehlerschlüssel', async () => {
    actionUserRequiredMock.mockRejectedValue(
      new ApiException('not authorized', { status: 403 }),
    );

    await expect(exportFahrtenbuchPdf(request)).resolves.toEqual({
      success: false,
      error: 'notLoggedIn',
    });
  });
});
