import { describe, expect, it } from 'vitest';
import {
  VEHICLE_PRESETS,
  type FahrtenbuchEntry,
  type FahrtenbuchVehicle,
} from './fahrtenbuch';
import { resolveEinsatzVehicleKilometers } from './fahrtenbuchEinsatzKm';

function vehicle(overrides: Partial<FahrtenbuchVehicle> = {}): FahrtenbuchVehicle {
  return {
    id: 'v1',
    name: 'RLFA 2000',
    active: true,
    counters: VEHICLE_PRESETS.fahrzeug,
    fuelTypes: ['diesel'],
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...overrides,
  };
}

function entry(overrides: Partial<FahrtenbuchEntry> = {}): FahrtenbuchEntry {
  return {
    id: 'e1',
    vehicleId: 'v1',
    vehicleName: 'RLFA 2000',
    driverName: 'Mustermann Max',
    zweck: 'einsatz',
    firecallId: 'f1',
    ziel: 'Neusiedl am See',
    abfahrt: '2026-08-01T10:00:00.000Z',
    ankunft: '2026-08-01T12:00:00.000Z',
    counters: { km: { start: 1000, end: 1012, diff: 12 } },
    group: 'ffn',
    deleted: false,
    createdAt: '',
    createdBy: '',
    createdByName: '',
    updatedAt: '',
    updatedBy: '',
    ...overrides,
  };
}

describe('resolveEinsatzVehicleKilometers', () => {
  it('liefert die Kilometer der Fahrt dieses Fahrzeugs zu diesem Einsatz', () => {
    const result = resolveEinsatzVehicleKilometers(['RLFA 2000'], {
      firecallId: 'f1',
      vehicles: [vehicle()],
      entries: [entry()],
    });

    expect(result).toEqual([{ name: 'RLFA 2000', km: 12 }]);
  });

  it('gleicht den Namen unscharf ab (Schreibweise der Einsatzkarte)', () => {
    const result = resolveEinsatzVehicleKilometers(['rlfa-2000'], {
      firecallId: 'f1',
      vehicles: [vehicle()],
      entries: [entry()],
    });

    expect(result[0]?.km).toBe(12);
  });

  it('summiert mehrere Fahrten desselben Fahrzeugs zu diesem Einsatz', () => {
    const result = resolveEinsatzVehicleKilometers(['RLFA 2000'], {
      firecallId: 'f1',
      vehicles: [vehicle()],
      entries: [
        entry(),
        entry({
          id: 'e2',
          counters: { km: { start: 1012, end: 1020, diff: 8 } },
        }),
      ],
    });

    expect(result[0]?.km).toBe(20);
  });

  it('ignoriert gelöschte Fahrten und Fahrten anderer Einsätze', () => {
    const result = resolveEinsatzVehicleKilometers(['RLFA 2000'], {
      firecallId: 'f1',
      vehicles: [vehicle()],
      entries: [
        entry({ id: 'e2', deleted: true }),
        entry({ id: 'e3', firecallId: 'f2' }),
      ],
    });

    expect(result).toEqual([{ name: 'RLFA 2000', km: undefined, missing: 'noEntry' }]);
  });

  it('meldet ein Fahrzeug ohne Fahrtenbuch-Stammdatensatz', () => {
    const result = resolveEinsatzVehicleKilometers(['WLA-Bergung'], {
      firecallId: 'f1',
      vehicles: [vehicle()],
      entries: [entry()],
    });

    expect(result[0]?.missing).toBe('noVehicle');
    expect(result[0]?.km).toBeUndefined();
  });

  it('meldet ein Fahrzeug ohne Fahrt zu diesem Einsatz', () => {
    const result = resolveEinsatzVehicleKilometers(['RLFA 2000'], {
      firecallId: 'f1',
      vehicles: [vehicle()],
      entries: [],
    });

    expect(result[0]?.missing).toBe('noEntry');
  });

  it('meldet ein Fahrzeug ohne Kilometerzähler (Anhänger, Preset „ohne Zähler")', () => {
    const result = resolveEinsatzVehicleKilometers(['WLA-Bergung'], {
      firecallId: 'f1',
      vehicles: [
        vehicle({
          id: 'v2',
          name: 'WLA-Bergung',
          counters: VEHICLE_PRESETS.none,
        }),
      ],
      entries: [entry({ vehicleId: 'v2', vehicleName: 'WLA-Bergung' })],
    });

    expect(result[0]?.missing).toBe('noCounter');
    expect(result[0]?.km).toBeUndefined();
  });

  it('meldet ein Boot ohne Kilometerzähler — Betriebsstunden sind keine Kilometer', () => {
    const result = resolveEinsatzVehicleKilometers(['MZB'], {
      firecallId: 'f1',
      vehicles: [
        vehicle({ id: 'v3', name: 'MZB', counters: VEHICLE_PRESETS.boot }),
      ],
      entries: [
        entry({
          vehicleId: 'v3',
          vehicleName: 'MZB',
          counters: { betriebsstundenBb: { start: 10, end: 12, diff: 2 } },
        }),
      ],
    });

    expect(result[0]?.missing).toBe('noCounter');
  });

  it('meldet eine Fahrt mit unausgefülltem Kilometerstand', () => {
    const result = resolveEinsatzVehicleKilometers(['RLFA 2000'], {
      firecallId: 'f1',
      vehicles: [vehicle()],
      entries: [entry({ counters: { km: { start: 1000 } } })],
    });

    expect(result[0]?.missing).toBe('noCounter');
  });

  it('behält die Reihenfolge und Schreibweise der übergebenen Namen', () => {
    const result = resolveEinsatzVehicleKilometers(['WLA-Bergung', 'rlfa 2000'], {
      firecallId: 'f1',
      vehicles: [vehicle()],
      entries: [entry()],
    });

    expect(result.map((r) => r.name)).toEqual(['WLA-Bergung', 'rlfa 2000']);
    expect(result[1]?.km).toBe(12);
  });
});
