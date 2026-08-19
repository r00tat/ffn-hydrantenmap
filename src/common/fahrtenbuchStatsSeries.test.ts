import { describe, expect, it } from 'vitest';
import type { FahrtenbuchEntry, FahrtenbuchVehicle } from './fahrtenbuch';
import { VEHICLE_PRESETS } from './fahrtenbuch';
import {
  buildBreakdown,
  buildDriverStats,
  buildFuelStats,
  buildStatsSummary,
  buildTimeSeries,
  buildWeekdaySeries,
} from './fahrtenbuchStatsSeries';

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

const car = vehicle();
const bus = vehicle({ id: 'v3', name: 'MTF' });
const boat = vehicle({
  id: 'v2',
  name: 'MZB',
  counters: VEHICLE_PRESETS.boot,
  fuelTypes: ['benzin'],
});
const trailer = vehicle({ id: 'v4', name: 'Anhänger', counters: [] });

const vehiclesById = new Map<string, FahrtenbuchVehicle>([
  ['v1', car],
  ['v2', boat],
  ['v3', bus],
  ['v4', trailer],
]);

function entry(partial: Partial<FahrtenbuchEntry> = {}): FahrtenbuchEntry {
  return {
    id: 'e1',
    vehicleId: 'v1',
    vehicleName: 'RLFA 2000',
    driverName: 'Max Muster',
    zweck: 'einsatz',
    ziel: 'Hauptstraße 1',
    abfahrt: '2025-03-14T09:00:00.000Z',
    ankunft: '2025-03-14T10:00:00.000Z',
    counters: { km: { start: 1000, end: 1010 } },
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

describe('buildStatsSummary', () => {
  it('sums trips, counter units, duration and fuel', () => {
    const summary = buildStatsSummary(
      [
        entry({ counters: { km: { start: 1000, end: 1010 } } }),
        entry({
          id: 'e2',
          vehicleId: 'v2',
          counters: { betriebsstundenBb: { start: 20, end: 22.5 } },
          ankunft: '2025-03-14T11:00:00.000Z',
          betriebsmittel: { benzin: 12 },
        }),
      ],
      vehiclesById,
    );
    expect(summary.trips).toBe(2);
    expect(summary.counterTotals).toEqual([
      { unit: 'km', value: 10, trips: 1 },
      { unit: 'h', value: 2.5, trips: 1 },
    ]);
    expect(summary.durationMinutes).toBe(180);
    expect(summary.fuelTotals).toEqual([{ fuel: 'benzin', liters: 12 }]);
  });

  it('averages the distance over the trips that have one', () => {
    const summary = buildStatsSummary(
      [
        entry({ counters: { km: { start: 1000, end: 1030 } } }),
        entry({ id: 'e2', counters: { km: { start: 1030, end: 1040 } } }),
        // Anhänger ohne Zähler — darf den Durchschnitt nicht verwässern.
        entry({ id: 'e3', vehicleId: 'v4', counters: {} }),
      ],
      vehiclesById,
    );
    expect(summary.distancePerTrip).toBe(20);
  });

  it('approximates the consumption from fuel and kilometres, ignoring adblue', () => {
    const summary = buildStatsSummary(
      [
        entry({
          counters: { km: { start: 1000, end: 1100 } },
          betriebsmittel: { diesel: 25, adblue: 5 },
        }),
      ],
      vehiclesById,
    );
    expect(summary.consumptionPer100Km).toBe(25);
  });

  it('leaves the consumption open without kilometres', () => {
    const summary = buildStatsSummary(
      [entry({ vehicleId: 'v4', counters: {}, betriebsmittel: { diesel: 10 } })],
      vehiclesById,
    );
    expect(summary.consumptionPer100Km).toBeUndefined();
  });

  it('counts defects, estimates and trips that carry no counter difference', () => {
    const summary = buildStatsSummary(
      [
        entry({ defekt: true, mangel: 'Blinker' }),
        entry({
          id: 'e2',
          counters: { km: { start: 1010, end: 1020 } },
          counterSources: { km: 'estimate' },
        }),
        // Fahrzeug mit Zähler, aber ohne erfassten Endstand: fehlt in der
        // Streckensumme und muss als Lücke sichtbar sein.
        entry({ id: 'e3', counters: { km: { start: 1020 } } }),
        // Anhänger: hat keinen Zähler und ist deshalb keine Lücke.
        entry({ id: 'e4', vehicleId: 'v4', counters: {} }),
      ],
      vehiclesById,
    );
    expect(summary.defects).toBe(1);
    expect(summary.estimatedTrips).toBe(1);
    expect(summary.tripsWithoutCounter).toBe(1);
  });

  it('is empty for no entries', () => {
    const summary = buildStatsSummary([], vehiclesById);
    expect(summary).toMatchObject({
      trips: 0,
      durationMinutes: 0,
      counterTotals: [],
      fuelTotals: [],
      defects: 0,
    });
    expect(summary.distancePerTrip).toBeUndefined();
  });
});

describe('buildTimeSeries', () => {
  const entries = [
    entry({ id: 'a', abfahrt: '2025-01-10T09:00:00.000Z' }),
    entry({ id: 'b', abfahrt: '2025-03-05T09:00:00.000Z', zweck: 'uebung' }),
    entry({ id: 'c', abfahrt: '2025-03-20T09:00:00.000Z' }),
  ];

  it('keeps months without a trip so the axis stays continuous', () => {
    const series = buildTimeSeries(entries, {
      vehiclesById,
      metric: 'trips',
      granularity: 'month',
      timeZone: vienna,
      from: '2025-01-01',
      to: '2025-03-31',
    });
    expect(series.points.map((p) => p.key)).toEqual([
      '2025-01',
      '2025-02',
      '2025-03',
    ]);
    expect(series.points.map((p) => p.total)).toEqual([1, 0, 2]);
    expect(series.total).toBe(3);
  });

  it('stacks by purpose in a fixed order so colours stay put', () => {
    const series = buildTimeSeries(entries, {
      vehiclesById,
      metric: 'trips',
      granularity: 'month',
      timeZone: vienna,
      from: '2025-01-01',
      to: '2025-03-31',
      stackBy: 'zweck',
    });
    expect(series.stacks.map((s) => s.key)).toEqual(['einsatz', 'uebung']);
    expect(series.points[2].values).toEqual({ einsatz: 1, uebung: 1 });
  });

  it('sums a unit metric per bucket', () => {
    const series = buildTimeSeries(
      [
        entry({ abfahrt: '2025-03-05T09:00:00.000Z', counters: { km: { start: 0, end: 12 } } }),
        entry({
          id: 'b',
          abfahrt: '2025-03-06T09:00:00.000Z',
          counters: { km: { start: 12, end: 20 } },
        }),
      ],
      {
        vehiclesById,
        metric: 'unit:km',
        granularity: 'month',
        timeZone: vienna,
        from: '2025-03-01',
        to: '2025-03-31',
      },
    );
    expect(series.points[0].total).toBe(20);
  });

  it('splits a fuel stack into one series per operating fluid', () => {
    const series = buildTimeSeries(
      [entry({ betriebsmittel: { diesel: 30, adblue: 4 } })],
      {
        vehiclesById,
        metric: 'fuel',
        granularity: 'month',
        timeZone: vienna,
        from: '2025-03-01',
        to: '2025-03-31',
        stackBy: 'fuel',
      },
    );
    expect(series.stacks.map((s) => s.key)).toEqual(['diesel', 'adblue']);
    expect(series.points[0].values).toEqual({ diesel: 30, adblue: 4 });
  });

  it('folds vehicles beyond the stack limit into one rest series', () => {
    const series = buildTimeSeries(
      [
        entry({ vehicleId: 'v1', counters: { km: { start: 0, end: 100 } } }),
        entry({ id: 'b', vehicleId: 'v3', counters: { km: { start: 0, end: 50 } } }),
        entry({ id: 'c', vehicleId: 'v2', counters: { betriebsstundenBb: { start: 0, end: 5 } } }),
      ],
      {
        vehiclesById,
        metric: 'trips',
        granularity: 'month',
        timeZone: vienna,
        from: '2025-03-01',
        to: '2025-03-31',
        stackBy: 'vehicle',
        maxStacks: 2,
      },
    );
    expect(series.stacks).toHaveLength(2);
    expect(series.stacks[1].key).toBe('__other');
    expect(series.points[0].total).toBe(3);
  });

  it('keeps trips without a driver in their own stack', () => {
    // Ein Anhänger hat keinen Fahrer. Fiele er weg, wäre der Balken niedriger
    // als die Kennzahl darüber — ohne erkennbaren Grund.
    const series = buildTimeSeries(
      [
        entry({ driverName: 'Max Muster' }),
        entry({ id: 'b', vehicleId: 'v4', driverName: '', counters: {} }),
      ],
      {
        vehiclesById,
        metric: 'trips',
        granularity: 'month',
        timeZone: vienna,
        from: '2025-03-01',
        to: '2025-03-31',
        stackBy: 'driver',
      },
    );
    expect(series.points[0].total).toBe(2);
    expect(series.stacks.map((s) => s.key)).toContain('__noDriver');
  });

  it('uses the vehicle name as the stack label', () => {
    const series = buildTimeSeries([entry()], {
      vehiclesById,
      metric: 'trips',
      granularity: 'month',
      timeZone: vienna,
      from: '2025-03-01',
      to: '2025-03-31',
      stackBy: 'vehicle',
    });
    expect(series.stacks[0]).toMatchObject({ key: 'v1', label: 'RLFA 2000' });
  });
});

describe('buildBreakdown', () => {
  it('ranks vehicles by the metric, descending', () => {
    const slices = buildBreakdown(
      [
        entry({ counters: { km: { start: 0, end: 20 } } }),
        entry({ id: 'b', vehicleId: 'v3', counters: { km: { start: 0, end: 80 } } }),
      ],
      { vehiclesById, metric: 'unit:km', dimension: 'vehicle' },
    );
    expect(slices).toEqual([
      { key: 'v3', label: 'MTF', value: 80, trips: 1 },
      { key: 'v1', label: 'RLFA 2000', value: 20, trips: 1 },
    ]);
  });

  it('keeps the fixed purpose order and drops purposes without a trip', () => {
    const slices = buildBreakdown(
      [entry({ zweck: 'versorgung' }), entry({ id: 'b', zweck: 'einsatz' })],
      { vehiclesById, metric: 'trips', dimension: 'zweck' },
    );
    expect(slices.map((s) => s.key)).toEqual(['einsatz', 'versorgung']);
  });

  it('skips units without a driver', () => {
    const slices = buildBreakdown(
      [entry({ vehicleId: 'v4', driverName: '', counters: {} })],
      { vehiclesById, metric: 'trips', dimension: 'driver' },
    );
    expect(slices).toEqual([]);
  });

  it('counts trips even when the metric contributes nothing', () => {
    const slices = buildBreakdown([entry({ vehicleId: 'v4', counters: {} })], {
      vehiclesById,
      metric: 'unit:km',
      dimension: 'vehicle',
    });
    // Keine Kilometer, aber eine Fahrt — der Eintrag darf nicht verschwinden.
    expect(slices).toEqual([
      { key: 'v4', label: 'Anhänger', value: 0, trips: 1 },
    ]);
  });
});

describe('buildDriverStats', () => {
  it('aggregates per driver and keeps the latest spelling of the name', () => {
    const stats = buildDriverStats(
      [
        entry({
          id: 'a',
          driverName: 'Max Muster',
          abfahrt: '2025-03-20T09:00:00.000Z',
          counters: { km: { start: 0, end: 30 } },
        }),
        entry({
          id: 'b',
          driverName: 'max muster',
          abfahrt: '2025-03-14T09:00:00.000Z',
          counters: { km: { start: 0, end: 10 } },
          vehicleId: 'v3',
          defekt: true,
          mangel: 'Blinker',
        }),
        entry({ id: 'c', driverId: 'p2', driverName: 'Eva Beispiel' }),
      ],
      vehiclesById,
    );
    expect(stats).toHaveLength(2);
    const [first] = stats;
    expect(first).toMatchObject({
      name: 'Max Muster',
      trips: 2,
      vehicleCount: 2,
      defects: 1,
      lastEntryAt: '2025-03-20T09:00:00.000Z',
    });
    expect(first.counterTotals).toEqual({ km: 40 });
  });

  it('ignores units without a driver', () => {
    const stats = buildDriverStats(
      [entry({ vehicleId: 'v4', driverName: '', counters: {} })],
      vehiclesById,
    );
    expect(stats).toEqual([]);
  });
});

describe('buildWeekdaySeries', () => {
  it('places trips on the local weekday, Monday first', () => {
    const series = buildWeekdaySeries(
      [
        // Freitag
        entry({ abfahrt: '2025-03-14T09:00:00.000Z' }),
        // 23:30 UTC am Sonntag ist in Wien schon Montag.
        entry({ id: 'b', abfahrt: '2025-03-16T23:30:00.000Z', zweck: 'uebung' }),
      ],
      { vehiclesById, metric: 'trips', timeZone: vienna },
    );
    expect(series.points.map((p) => p.key)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
    ]);
    expect(series.points[0].total).toBe(1);
    expect(series.points[4].total).toBe(1);
    expect(series.stacks.map((s) => s.key)).toEqual(['einsatz', 'uebung']);
  });
});

describe('buildFuelStats', () => {
  it('reports litres, kilometres and the approximated consumption per vehicle', () => {
    const stats = buildFuelStats(
      [
        entry({
          counters: { km: { start: 0, end: 200 } },
          betriebsmittel: { diesel: 50, adblue: 2 },
        }),
        entry({
          id: 'b',
          vehicleId: 'v2',
          counters: { betriebsstundenBb: { start: 0, end: 4 } },
          betriebsmittel: { benzin: 20 },
        }),
      ],
      vehiclesById,
    );
    expect(stats.totals).toEqual({ diesel: 50, benzin: 20, adblue: 2 });
    const car = stats.perVehicle.find((v) => v.vehicleId === 'v1');
    expect(car).toMatchObject({
      name: 'RLFA 2000',
      distanceKm: 200,
      consumptionPer100Km: 25,
    });
    expect(car?.liters).toEqual({ diesel: 50, adblue: 2 });
    // Ein Boot fährt keine Kilometer — ein l/100 km wäre eine erfundene Zahl.
    const boatStat = stats.perVehicle.find((v) => v.vehicleId === 'v2');
    expect(boatStat?.consumptionPer100Km).toBeUndefined();
  });

  it('lists only vehicles that refuelled or drove', () => {
    const stats = buildFuelStats([entry({ betriebsmittel: { diesel: 10 } })], vehiclesById);
    expect(stats.perVehicle.map((v) => v.vehicleId)).toEqual(['v1']);
  });
});

describe('buildDriverStats mit Zusatzfahrern', () => {
  const twoHoursHundredKm = {
    abfahrt: '2025-03-14T08:00:00.000Z',
    ankunft: '2025-03-14T10:00:00.000Z',
    counters: { km: { start: 1000, end: 1100 } },
  };

  it('teilt Kilometer und Dauer gleichmäßig', () => {
    const stats = buildDriverStats(
      [
        entry({
          ...twoHoursHundredKm,
          driverName: 'Max Muster',
          coDrivers: [{ name: 'Anna Bauer' }],
        }),
      ],
      vehiclesById,
    );

    expect(stats).toHaveLength(2);
    for (const stat of stats) {
      expect(stat.trips).toBe(1);
      expect(stat.sharedTrips).toBe(1);
      expect(stat.counterTotals.km).toBe(50);
      expect(stat.durationMinutes).toBe(60);
    }
  });

  it('lässt eine Fahrt mit einem Fahrer unverändert', () => {
    const [stat] = buildDriverStats(
      [entry({ ...twoHoursHundredKm, driverName: 'Max Muster' })],
      vehiclesById,
    );
    expect(stat.trips).toBe(1);
    expect(stat.sharedTrips).toBe(0);
    expect(stat.counterTotals.km).toBe(100);
    expect(stat.durationMinutes).toBe(120);
  });

  it('zählt Defekt und Zweck ganz — ein Defekt ist nicht teilbar', () => {
    const stats = buildDriverStats(
      [
        entry({
          driverName: 'Max Muster',
          coDrivers: [{ name: 'Anna Bauer' }],
          zweck: 'einsatz',
          defekt: true,
        }),
      ],
      vehiclesById,
    );
    expect(stats).toHaveLength(2);
    for (const stat of stats) {
      expect(stat.defects).toBe(1);
      expect(stat.zwecke.einsatz).toBe(1);
    }
  });

  it('nimmt den Zusatzfahrer als eigene Zeile auf', () => {
    const stats = buildDriverStats(
      [entry({ driverName: 'Max Muster', coDrivers: [{ name: 'Anna Bauer' }] })],
      vehiclesById,
    );
    expect(stats.map((s) => s.name).sort()).toEqual(['Anna Bauer', 'Max Muster']);
  });
});

describe('Fahrer-Aufteilung summiert auf die Gesamtsumme', () => {
  const shared = entry({
    driverName: 'Max Muster',
    coDrivers: [{ name: 'Anna Bauer' }],
    counters: { km: { start: 1000, end: 1100 } },
  });

  it('buildBreakdown nach Fahrer', () => {
    const slices = buildBreakdown([shared], {
      vehiclesById,
      metric: 'unit:km',
      dimension: 'driver',
    });
    expect(slices).toHaveLength(2);
    expect(slices.reduce((sum, slice) => sum + slice.value, 0)).toBe(100);
    for (const slice of slices) expect(slice.trips).toBe(1);
  });

  it('buildTimeSeries gestapelt nach Fahrer', () => {
    const series = buildTimeSeries([shared], {
      vehiclesById,
      metric: 'unit:km',
      granularity: 'month',
      timeZone: vienna,
      from: '2025-03-01',
      to: '2025-03-31',
      stackBy: 'driver',
    });
    expect(series.stacks).toHaveLength(2);
    expect(series.total).toBe(100);
  });

  it('lässt die Aufteilung nach Fahrzeug ungeteilt', () => {
    const slices = buildBreakdown([shared], {
      vehiclesById,
      metric: 'unit:km',
      dimension: 'vehicle',
    });
    expect(slices).toHaveLength(1);
    expect(slices[0].value).toBe(100);
  });
});

describe('Kennzahlen bei gesetztem Fahrerfilter', () => {
  const shared = entry({
    driverName: 'Max Muster',
    coDrivers: [{ name: 'Anna Bauer' }],
    abfahrt: '2025-03-14T08:00:00.000Z',
    ankunft: '2025-03-14T10:00:00.000Z',
    counters: { km: { start: 1000, end: 1100 } },
    betriebsmittel: { diesel: 20 },
  });

  it('rechnet Strecke, Dauer und Menge anteilig, die Fahrtenzahl ganz', () => {
    const summary = buildStatsSummary([shared], vehiclesById, {
      driverKey: 'anna bauer',
    });
    expect(summary.trips).toBe(1);
    expect(summary.durationMinutes).toBe(60);
    expect(summary.counterTotals).toEqual([{ unit: 'km', value: 50, trips: 1 }]);
    expect(summary.fuelLiters).toBe(10);
    // Der Verbrauch ist ein Verhältnis und ändert sich durch die Teilung nicht.
    expect(summary.consumptionPer100Km).toBe(20);
  });

  it('rechnet ohne Fahrerfilter unverändert', () => {
    const summary = buildStatsSummary([shared], vehiclesById);
    expect(summary.durationMinutes).toBe(120);
    expect(summary.counterTotals).toEqual([{ unit: 'km', value: 100, trips: 1 }]);
    expect(summary.fuelLiters).toBe(20);
    expect(summary.consumptionPer100Km).toBe(20);
  });

  it('rechnet die Zeitreihe anteilig', () => {
    const series = buildTimeSeries([shared], {
      vehiclesById,
      metric: 'unit:km',
      granularity: 'month',
      timeZone: vienna,
      from: '2025-03-01',
      to: '2025-03-31',
      driverKey: 'anna bauer',
    });
    expect(series.total).toBe(50);
  });

  it('zeigt bei Aufteilung nach Fahrer nur den gefilterten Fahrer', () => {
    const series = buildTimeSeries([shared], {
      vehiclesById,
      metric: 'unit:km',
      granularity: 'month',
      timeZone: vienna,
      from: '2025-03-01',
      to: '2025-03-31',
      stackBy: 'driver',
      driverKey: 'anna bauer',
    });
    expect(series.stacks.map((s) => s.key)).toEqual(['anna bauer']);
    expect(series.total).toBe(50);
  });

  it('lässt buildFuelStats ungeteilt — es wertet je Fahrzeug aus', () => {
    const stats = buildFuelStats([shared], vehiclesById);
    expect(stats.totals.diesel).toBe(20);
    expect(stats.perVehicle[0].distanceKm).toBe(100);
  });
});
