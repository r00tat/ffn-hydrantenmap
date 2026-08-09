import { describe, expect, it } from 'vitest';
import type { FahrtenbuchEntry, FahrtenbuchVehicle } from './fahrtenbuch';
import { VEHICLE_PRESETS } from './fahrtenbuch';
import {
  bucketDayRange,
  bucketKeyOf,
  bucketKeysBetween,
  counterDiffsByUnit,
  counterUnitsOf,
  driverKeyOf,
  entryDurationMinutes,
  entryFuelLiters,
  filterStatsEntries,
  finerGranularity,
  hasEstimatedCounter,
  metricValue,
  suggestGranularity,
} from './fahrtenbuchStats';

const vienna = 'Europe/Vienna';

function vehicle(partial: Partial<FahrtenbuchVehicle> = {}): FahrtenbuchVehicle {
  return {
    id: 'v1',
    name: 'RLFA 2000',
    active: true,
    counters: VEHICLE_PRESETS.fahrzeug,
    fuelTypes: ['diesel'],
    createdAt: '2025-01-01T00:00:00.000Z',
    createdBy: 'u1',
    updatedAt: '2025-01-01T00:00:00.000Z',
    updatedBy: 'u1',
    ...partial,
  };
}

function entry(partial: Partial<FahrtenbuchEntry> = {}): FahrtenbuchEntry {
  return {
    id: 'e1',
    vehicleId: 'v1',
    vehicleName: 'RLFA 2000',
    driverName: 'Max Muster',
    zweck: 'einsatz',
    ziel: 'Hauptstraße 1',
    abfahrt: '2025-03-14T09:00:00.000Z',
    ankunft: '2025-03-14T10:30:00.000Z',
    counters: { km: { start: 1000, end: 1042, diff: 42 } },
    group: 'g1',
    deleted: false,
    createdAt: '2025-03-14T10:35:00.000Z',
    createdBy: 'u1',
    createdByName: 'Max Muster',
    updatedAt: '2025-03-14T10:35:00.000Z',
    updatedBy: 'u1',
    ...partial,
  };
}

const boat = vehicle({
  id: 'v2',
  name: 'MZB',
  counters: VEHICLE_PRESETS.boot,
  fuelTypes: ['benzin'],
});

describe('counterUnitsOf', () => {
  it('lists the units of all counters with a difference, km first', () => {
    expect(counterUnitsOf([boat, vehicle()])).toEqual(['km', 'h']);
  });

  it('ignores reading-only counters — a sum of readings means nothing', () => {
    const onlyReadings = vehicle({
      counters: [
        {
          id: 'pumpe',
          label: 'Pumpe',
          unit: 'bar',
          mode: 'reading',
          changeWarning: 'none',
          required: false,
        },
      ],
    });
    expect(counterUnitsOf([onlyReadings])).toEqual([]);
  });
});

describe('counterDiffsByUnit', () => {
  it('sums the difference of start/end counters per unit', () => {
    expect(counterDiffsByUnit(entry(), vehicle())).toEqual({ km: 42 });
  });

  it('recomputes the difference instead of trusting a stale diff field', () => {
    const stale = entry({ counters: { km: { start: 1000, end: 1050, diff: 42 } } });
    expect(counterDiffsByUnit(stale, vehicle())).toEqual({ km: 50 });
  });

  it('rounds floating point noise of operating hours', () => {
    const trip = entry({
      vehicleId: 'v2',
      counters: { betriebsstundenBb: { start: 1245, end: 1246.1 } },
    });
    expect(counterDiffsByUnit(trip, boat)).toEqual({ h: 1.1 });
  });

  it('skips reading counters', () => {
    const trip = entry({
      vehicleId: 'v2',
      counters: {
        betriebsstundenBb: { start: 10, end: 12 },
        lenzpumpeStb: { end: 400 },
      },
    });
    expect(counterDiffsByUnit(trip, boat)).toEqual({ h: 2 });
  });

  it('drops a negative difference — an odometer does not run backwards', () => {
    const trip = entry({ counters: { km: { start: 1000, end: 900 } } });
    expect(counterDiffsByUnit(trip, vehicle())).toEqual({});
  });

  it('returns nothing when only a start reading exists', () => {
    const trip = entry({ counters: { km: { start: 1000 } } });
    expect(counterDiffsByUnit(trip, vehicle())).toEqual({});
  });

  it('returns nothing when the vehicle is unknown', () => {
    // Ohne Zählerdefinition ist die Einheit nicht bekannt; eine Zahl ohne
    // Einheit gehört in keine Summe.
    expect(counterDiffsByUnit(entry(), undefined)).toEqual({});
  });
});

describe('entryDurationMinutes', () => {
  it('measures the time between departure and arrival', () => {
    expect(entryDurationMinutes(entry())).toBe(90);
  });

  it('ignores an arrival before the departure', () => {
    expect(
      entryDurationMinutes(
        entry({ ankunft: '2025-03-14T08:00:00.000Z' }),
      ),
    ).toBeUndefined();
  });

  it('ignores an unparsable timestamp', () => {
    expect(entryDurationMinutes(entry({ ankunft: '' }))).toBeUndefined();
  });
});

describe('entryFuelLiters', () => {
  it('sums all refuelled operating fluids', () => {
    const trip = entry({ betriebsmittel: { diesel: 40.5, adblue: 5 } });
    expect(entryFuelLiters(trip)).toBe(45.5);
  });

  it('is zero without a refuelling', () => {
    expect(entryFuelLiters(entry())).toBe(0);
  });
});

describe('metricValue', () => {
  it('counts a trip as one', () => {
    expect(metricValue(entry(), vehicle(), 'trips')).toBe(1);
  });

  it('reads the difference of the requested unit', () => {
    expect(metricValue(entry(), vehicle(), 'unit:km')).toBe(42);
    expect(metricValue(entry(), vehicle(), 'unit:h')).toBe(0);
  });

  it('reports the duration in minutes', () => {
    expect(metricValue(entry(), vehicle(), 'duration')).toBe(90);
  });

  it('reports the refuelled litres', () => {
    const trip = entry({ betriebsmittel: { diesel: 30 } });
    expect(metricValue(trip, vehicle(), 'fuel')).toBe(30);
  });
});

describe('driverKeyOf', () => {
  it('prefers the linked person', () => {
    expect(driverKeyOf(entry({ driverId: 'p1' }))).toBe('p1');
  });

  it('falls back to the normalized name so spelling variants merge', () => {
    expect(driverKeyOf(entry({ driverName: 'Max  MUSTER' }))).toBe(
      driverKeyOf(entry({ driverName: 'Max Muster' })),
    );
  });

  it('is empty for a unit without a driver', () => {
    expect(driverKeyOf(entry({ driverName: '' }))).toBe('');
  });
});

describe('filterStatsEntries', () => {
  const entries = [
    entry({ id: 'a', abfahrt: '2025-03-14T09:00:00.000Z' }),
    entry({
      id: 'b',
      vehicleId: 'v2',
      zweck: 'uebung',
      driverId: 'p2',
      driverName: 'Eva Beispiel',
      abfahrt: '2025-04-02T09:00:00.000Z',
      defekt: true,
      mangel: 'Blinker defekt',
    }),
    entry({ id: 'c', deleted: true, abfahrt: '2025-03-20T09:00:00.000Z' }),
  ];
  const base = { from: '2025-01-01', to: '2025-12-31', vehicleIds: [], zwecke: [] };

  it('drops deleted entries', () => {
    expect(
      filterStatsEntries(entries, base, vienna).map((e) => e.id),
    ).toEqual(['a', 'b']);
  });

  it('applies the day range in the local zone', () => {
    // Eine Fahrt um 23:30 UTC am 31.03. ist in Wien der 1. April.
    const nightTrip = entry({ id: 'n', abfahrt: '2025-03-31T23:30:00.000Z' });
    const filtered = filterStatsEntries(
      [nightTrip],
      { ...base, from: '2025-04-01', to: '2025-04-30' },
      vienna,
    );
    expect(filtered.map((e) => e.id)).toEqual(['n']);
  });

  it('filters by vehicle, purpose, driver and defect', () => {
    expect(
      filterStatsEntries(entries, { ...base, vehicleIds: ['v2'] }, vienna).map(
        (e) => e.id,
      ),
    ).toEqual(['b']);
    expect(
      filterStatsEntries(entries, { ...base, zwecke: ['einsatz'] }, vienna).map(
        (e) => e.id,
      ),
    ).toEqual(['a']);
    expect(
      filterStatsEntries(entries, { ...base, driverKey: 'p2' }, vienna).map(
        (e) => e.id,
      ),
    ).toEqual(['b']);
    expect(
      filterStatsEntries(entries, { ...base, onlyDefects: true }, vienna).map(
        (e) => e.id,
      ),
    ).toEqual(['b']);
  });
});

describe('suggestGranularity', () => {
  it('uses days for a month, weeks for a quarter, months for a year', () => {
    expect(suggestGranularity('2025-03-01', '2025-03-31')).toBe('day');
    expect(suggestGranularity('2025-01-01', '2025-03-31')).toBe('week');
    expect(suggestGranularity('2025-01-01', '2025-12-31')).toBe('month');
    expect(suggestGranularity('2015-01-01', '2025-12-31')).toBe('year');
  });
});

describe('bucketKeyOf', () => {
  it('formats the bucket of each granularity', () => {
    const iso = '2025-03-14T11:00:00.000Z';
    expect(bucketKeyOf(iso, 'day', vienna)).toBe('2025-03-14');
    expect(bucketKeyOf(iso, 'week', vienna)).toBe('2025-W11');
    expect(bucketKeyOf(iso, 'month', vienna)).toBe('2025-03');
    expect(bucketKeyOf(iso, 'year', vienna)).toBe('2025');
  });

  it('uses the local day, not the UTC day', () => {
    expect(bucketKeyOf('2025-03-31T23:30:00.000Z', 'month', vienna)).toBe(
      '2025-04',
    );
  });

  it('returns undefined for an unparsable timestamp', () => {
    expect(bucketKeyOf('', 'month', vienna)).toBeUndefined();
  });
});

describe('bucketKeysBetween', () => {
  it('lists every bucket of the range, including empty ones', () => {
    expect(bucketKeysBetween('2025-01-01', '2025-04-15', 'month')).toEqual([
      '2025-01',
      '2025-02',
      '2025-03',
      '2025-04',
    ]);
  });

  it('lists days in order', () => {
    expect(bucketKeysBetween('2025-03-30', '2025-04-02', 'day')).toEqual([
      '2025-03-30',
      '2025-03-31',
      '2025-04-01',
      '2025-04-02',
    ]);
  });

  it('crosses the ISO year boundary of weeks', () => {
    expect(bucketKeysBetween('2024-12-29', '2025-01-06', 'week')).toEqual([
      '2024-W52',
      '2025-W01',
      '2025-W02',
    ]);
  });
});

describe('bucketDayRange', () => {
  it('resolves a month bucket to its first and last day', () => {
    expect(bucketDayRange('2025-02', 'month')).toEqual({
      from: '2025-02-01',
      to: '2025-02-28',
    });
  });

  it('resolves a week bucket to Monday through Sunday', () => {
    expect(bucketDayRange('2025-W11', 'week')).toEqual({
      from: '2025-03-10',
      to: '2025-03-16',
    });
  });

  it('resolves a year and a day bucket', () => {
    expect(bucketDayRange('2025', 'year')).toEqual({
      from: '2025-01-01',
      to: '2025-12-31',
    });
    expect(bucketDayRange('2025-03-14', 'day')).toEqual({
      from: '2025-03-14',
      to: '2025-03-14',
    });
  });

  it('returns undefined for a malformed key', () => {
    expect(bucketDayRange('Quartal 1', 'month')).toBeUndefined();
  });
});

describe('finerGranularity', () => {
  it('steps down one level and stops at day', () => {
    expect(finerGranularity('year')).toBe('month');
    expect(finerGranularity('month')).toBe('day');
    expect(finerGranularity('week')).toBe('day');
    expect(finerGranularity('day')).toBe('day');
  });
});

describe('hasEstimatedCounter', () => {
  it('detects an estimated end reading', () => {
    expect(
      hasEstimatedCounter(entry({ counterSources: { km: 'estimate' } })),
    ).toBe(true);
  });

  it('does not flag a routed or unchanged reading', () => {
    expect(
      hasEstimatedCounter(
        entry({ counterSources: { km: 'route', pumpe: 'unchanged' } }),
      ),
    ).toBe(false);
  });
});
