/**
 * Die Zusammenfassungen der Fahrtenbuch-Statistik: Kennzahlen eines Zeitraums,
 * Zeitreihen, Ranglisten, Fahrer- und Betriebsmittelauswertung.
 *
 * Baut auf den Grundrechenarten in `fahrtenbuchStats.ts` auf und bleibt wie
 * diese frei von React, Firestore und next-intl. Beschriftungen sind entweder
 * Daten (ein Fahrzeugname) oder Schlüssel, die die Oberfläche übersetzt (ein
 * Fahrtzweck, ein Betriebsmittel) — die Rechnung soll nicht von der Sprache des
 * Benutzers abhängen.
 */

import {
  FAHRT_ZWECKE,
  FUEL_TYPES,
  type FahrtZweck,
  type FahrtenbuchEntry,
  type FahrtenbuchVehicle,
  type FuelType,
} from './fahrtenbuch';
import {
  counterDiffsByUnit,
  driverKeyOf,
  entryDurationMinutes,
  hasEstimatedCounter,
  metricValue,
  type StatsDimension,
  type StatsGranularity,
  type StatsMetric,
  bucketKeyOf,
  bucketKeysBetween,
} from './fahrtenbuchStats';
import { zonedParts } from './zonedDay';

export type VehicleLookup = Map<string, FahrtenbuchVehicle>;

/** Kraftstoffe für die Verbrauchsnäherung — AdBlue ist ein Zusatz, kein Antrieb. */
const CONSUMPTION_FUELS: FuelType[] = ['diesel', 'benzin'];

/** Schlüssel der Sammelreihe, wenn mehr Stapel anfallen als sinnvoll lesbar. */
export const OTHER_STACK_KEY = '__other';

/**
 * Schlüssel für Fahrten ohne Fahrer (Anhänger, Wechselladeaufbau) beim
 * Aufteilen nach Fahrer.
 *
 * Sie brauchen einen eigenen Stapel, statt einfach wegzufallen: Sonst wären die
 * Balken niedriger als die Kennzahl darüber, und niemand könnte sich erklären,
 * wohin die Differenz verschwunden ist. In der Fahrer-Rangliste haben sie
 * dagegen nichts zu suchen — „ohne Fahrer" ist kein Fahrer.
 */
export const NO_DRIVER_STACK_KEY = '__noDriver';

const round = (value: number): number => Math.round(value * 100) / 100;

/** Die Einheit der Streckenmaße, die im Verbrauch als Kilometer gilt. */
const DISTANCE_UNIT = 'km';

export interface StatsCounterTotal {
  unit: string;
  value: number;
  /** Zahl der Fahrten, die zu dieser Summe beigetragen haben. */
  trips: number;
}

export interface StatsFuelTotal {
  fuel: FuelType;
  liters: number;
}

export interface StatsSummary {
  trips: number;
  durationMinutes: number;
  /** Je Einheit die Summe der Zählerdifferenzen, Kilometer zuerst. */
  counterTotals: StatsCounterTotal[];
  fuelTotals: StatsFuelTotal[];
  fuelLiters: number;
  defects: number;
  /** Fahrten mit mindestens einem geschätzten Endstand. */
  estimatedTrips: number;
  /**
   * Fahrten, deren Fahrzeug einen Differenzzähler hat, die aber keine Differenz
   * beitragen — fehlender Endstand oder ein Wert, der nicht sein kann. Sie
   * fehlen in den Summen; ohne diese Zahl sähe die Streckensumme vollständig
   * aus.
   */
  tripsWithoutCounter: number;
  /** Ø Kilometer der Fahrten, die Kilometer beitragen. */
  distancePerTrip?: number;
  /** Näherung: getankte Kraftstoffmenge auf 100 gefahrene Kilometer. */
  consumptionPer100Km?: number;
}

/**
 * Ordnet Einheiten für die Ausgabe: Kilometer zuerst, dann alphabetisch.
 * Dieselbe Ordnung wie `counterUnitsOf`, damit Kennzahlen und Auswahl
 * übereinstimmen.
 */
function compareUnits(a: string, b: string): number {
  if (a === b) return 0;
  if (a === DISTANCE_UNIT) return -1;
  if (b === DISTANCE_UNIT) return 1;
  return a.localeCompare(b);
}

/** Ob das Fahrzeug überhaupt einen Zähler hat, der eine Differenz bildet. */
function hasDiffCounter(vehicle: FahrtenbuchVehicle | undefined): boolean {
  return (vehicle?.counters ?? []).some((def) => def.mode === 'startEnd');
}

export function buildStatsSummary(
  entries: FahrtenbuchEntry[],
  vehiclesById: VehicleLookup,
): StatsSummary {
  const counters = new Map<string, { value: number; trips: number }>();
  const fuels = new Map<FuelType, number>();
  let durationMinutes = 0;
  let defects = 0;
  let estimatedTrips = 0;
  let tripsWithoutCounter = 0;

  for (const entry of entries) {
    const vehicle = vehiclesById.get(entry.vehicleId);
    durationMinutes += entryDurationMinutes(entry) ?? 0;
    if (entry.defekt) defects += 1;
    if (hasEstimatedCounter(entry)) estimatedTrips += 1;

    const diffs = counterDiffsByUnit(entry, vehicle);
    const units = Object.entries(diffs);
    if (units.length === 0 && hasDiffCounter(vehicle)) tripsWithoutCounter += 1;
    for (const [unit, value] of units) {
      const total = counters.get(unit) ?? { value: 0, trips: 0 };
      total.value = round(total.value + value);
      total.trips += 1;
      counters.set(unit, total);
    }

    for (const fuel of FUEL_TYPES) {
      const amount = entry.betriebsmittel?.[fuel];
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        continue;
      }
      fuels.set(fuel, round((fuels.get(fuel) ?? 0) + amount));
    }
  }

  const counterTotals = [...counters.entries()]
    .map(([unit, total]) => ({ unit, ...total }))
    .sort((a, b) => compareUnits(a.unit, b.unit));
  const fuelTotals = FUEL_TYPES.filter((fuel) => fuels.has(fuel)).map((fuel) => ({
    fuel,
    liters: fuels.get(fuel) as number,
  }));

  const distance = counters.get(DISTANCE_UNIT);
  const consumptionLiters = CONSUMPTION_FUELS.reduce(
    (sum, fuel) => sum + (fuels.get(fuel) ?? 0),
    0,
  );

  return {
    trips: entries.length,
    durationMinutes,
    counterTotals,
    fuelTotals,
    fuelLiters: round(
      fuelTotals.reduce((sum, total) => sum + total.liters, 0),
    ),
    defects,
    estimatedTrips,
    tripsWithoutCounter,
    distancePerTrip:
      distance && distance.trips > 0
        ? round(distance.value / distance.trips)
        : undefined,
    consumptionPer100Km:
      distance && distance.value > 0 && consumptionLiters > 0
        ? round((consumptionLiters / distance.value) * 100)
        : undefined,
  };
}

export interface StatsStack {
  key: string;
  /** Anzeigetext, soweit er aus den Daten kommt; sonst gleich `key`. */
  label: string;
  total: number;
}

export interface StatsPoint {
  key: string;
  total: number;
  /** Beitrag je Stapel; fehlende Stapel sind 0. */
  values: Record<string, number>;
}

export interface StatsSeries {
  stacks: StatsStack[];
  points: StatsPoint[];
  total: number;
}

/** Wonach eine Reihe gestapelt wird; `fuel` teilt nach Betriebsmittel auf. */
export type StatsStackBy = StatsDimension | 'fuel' | 'none';

interface StackContribution {
  key: string;
  label: string;
  value: number;
}

/**
 * Was eine Fahrt zu welchem Stapel beiträgt.
 *
 * Bei `fuel` sind es mehrere Beiträge — eine Fahrt kann Diesel und AdBlue
 * getankt haben. Alle anderen Aufteilungen ordnen den ganzen Wert einem Stapel
 * zu.
 */
function stackContributions(
  entry: FahrtenbuchEntry,
  vehicle: FahrtenbuchVehicle | undefined,
  metric: StatsMetric,
  stackBy: StatsStackBy,
): StackContribution[] {
  if (stackBy === 'fuel') {
    const contributions: StackContribution[] = [];
    for (const fuel of FUEL_TYPES) {
      const amount = entry.betriebsmittel?.[fuel];
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        continue;
      }
      contributions.push({ key: fuel, label: fuel, value: amount });
    }
    return contributions;
  }

  const value = metricValue(entry, vehicle, metric);
  if (stackBy === 'none') {
    return [{ key: 'total', label: 'total', value }];
  }
  if (stackBy === 'zweck') {
    return [{ key: entry.zweck, label: entry.zweck, value }];
  }
  if (stackBy === 'vehicle') {
    return [
      {
        key: entry.vehicleId,
        label: vehicle?.name ?? entry.vehicleName ?? entry.vehicleId,
        value,
      },
    ];
  }
  const driverKey = driverKeyOf(entry);
  if (!driverKey) {
    return [
      { key: NO_DRIVER_STACK_KEY, label: NO_DRIVER_STACK_KEY, value },
    ];
  }
  return [{ key: driverKey, label: entry.driverName ?? driverKey, value }];
}

/**
 * Reihenfolge der Stapel. Fahrtzwecke und Betriebsmittel behalten ihre feste
 * Ordnung, damit dieselbe Kategorie über alle Diagramme dieselbe Farbe hat;
 * Fahrzeuge und Fahrer stehen nach Größe.
 */
function orderStacks(
  stacks: Map<string, StatsStack>,
  stackBy: StatsStackBy,
  maxStacks: number,
): StatsStack[] {
  const fixedOrder: string[] | undefined =
    stackBy === 'zweck' ? FAHRT_ZWECKE : stackBy === 'fuel' ? FUEL_TYPES : undefined;
  if (fixedOrder) {
    return fixedOrder
      .filter((key) => stacks.has(key))
      .map((key) => stacks.get(key) as StatsStack);
  }
  const ordered = [...stacks.values()].sort(
    (a, b) => b.total - a.total || a.label.localeCompare(b.label),
  );
  if (ordered.length <= maxStacks) return ordered;
  // Mehr Stapel als lesbar: Der Rest wandert in eine Sammelreihe. Ohne sie
  // stimmte die Höhe der Balken nicht mehr mit den Kennzahlen überein.
  const kept = ordered.slice(0, maxStacks - 1);
  const rest = ordered.slice(maxStacks - 1);
  return [
    ...kept,
    {
      key: OTHER_STACK_KEY,
      label: OTHER_STACK_KEY,
      total: round(rest.reduce((sum, stack) => sum + stack.total, 0)),
    },
  ];
}

export interface BuildTimeSeriesOptions {
  vehiclesById: VehicleLookup;
  metric: StatsMetric;
  granularity: StatsGranularity;
  timeZone: string;
  /** Erster Tag des Zeitraums, `YYYY-MM-DD` — auch leere Abschnitte erscheinen. */
  from: string;
  to: string;
  stackBy?: StatsStackBy;
  /** Höchstzahl der Stapel bei Fahrzeugen und Fahrern; darüber „Sonstige". */
  maxStacks?: number;
}

export function buildTimeSeries(
  entries: FahrtenbuchEntry[],
  options: BuildTimeSeriesOptions,
): StatsSeries {
  const {
    vehiclesById,
    metric,
    granularity,
    timeZone,
    from,
    to,
    stackBy = 'none',
    maxStacks = 8,
  } = options;

  const buckets = bucketKeysBetween(from, to, granularity);
  return buildSeries(entries, {
    vehiclesById,
    metric,
    stackBy,
    maxStacks,
    buckets,
    bucketOf: (entry) => bucketKeyOf(entry.abfahrt, granularity, timeZone),
  });
}

interface BuildSeriesOptions {
  vehiclesById: VehicleLookup;
  metric: StatsMetric;
  stackBy: StatsStackBy;
  maxStacks: number;
  /** Alle Abschnitte in Ausgabereihenfolge, auch die ohne Fahrt. */
  buckets: string[];
  bucketOf: (entry: FahrtenbuchEntry) => string | undefined;
}

function buildSeries(
  entries: FahrtenbuchEntry[],
  options: BuildSeriesOptions,
): StatsSeries {
  const { vehiclesById, metric, stackBy, maxStacks, buckets, bucketOf } = options;
  const stacks = new Map<string, StatsStack>();
  /** bucket → stack → Wert */
  const values = new Map<string, Map<string, number>>();
  const known = new Set(buckets);

  for (const entry of entries) {
    const bucket = bucketOf(entry);
    if (!bucket || !known.has(bucket)) continue;
    const vehicle = vehiclesById.get(entry.vehicleId);
    for (const contribution of stackContributions(entry, vehicle, metric, stackBy)) {
      const stack = stacks.get(contribution.key) ?? {
        key: contribution.key,
        label: contribution.label,
        total: 0,
      };
      stack.total = round(stack.total + contribution.value);
      // Die jüngste Schreibweise gewinnt; `entries` kommt absteigend nach
      // Abfahrt herein.
      if (!stacks.has(contribution.key)) stack.label = contribution.label;
      stacks.set(contribution.key, stack);

      const perStack = values.get(bucket) ?? new Map<string, number>();
      perStack.set(
        contribution.key,
        round((perStack.get(contribution.key) ?? 0) + contribution.value),
      );
      values.set(bucket, perStack);
    }
  }

  const ordered = orderStacks(stacks, stackBy, maxStacks);
  const keptKeys = new Set(ordered.map((stack) => stack.key));
  const points: StatsPoint[] = buckets.map((bucket) => {
    const perStack = values.get(bucket);
    const point: StatsPoint = { key: bucket, total: 0, values: {} };
    for (const [key, value] of perStack ?? []) {
      const target = keptKeys.has(key) ? key : OTHER_STACK_KEY;
      point.values[target] = round((point.values[target] ?? 0) + value);
      point.total = round(point.total + value);
    }
    return point;
  });

  return {
    stacks: ordered,
    points,
    total: round(points.reduce((sum, point) => sum + point.total, 0)),
  };
}

export interface BuildWeekdaySeriesOptions {
  vehiclesById: VehicleLookup;
  metric: StatsMetric;
  timeZone: string;
  stackBy?: StatsStackBy;
  maxStacks?: number;
}

/** Sieben Abschnitte, `'1'` Montag bis `'7'` Sonntag. */
export function buildWeekdaySeries(
  entries: FahrtenbuchEntry[],
  options: BuildWeekdaySeriesOptions,
): StatsSeries {
  const {
    vehiclesById,
    metric,
    timeZone,
    stackBy = 'zweck',
    maxStacks = 8,
  } = options;
  return buildSeries(entries, {
    vehiclesById,
    metric,
    stackBy,
    maxStacks,
    buckets: ['1', '2', '3', '4', '5', '6', '7'],
    bucketOf: (entry) => {
      const weekday = zonedParts(entry.abfahrt, timeZone)?.weekday;
      return weekday === undefined ? undefined : String(weekday);
    },
  });
}

export interface StatsSlice {
  key: string;
  label: string;
  value: number;
  trips: number;
}

export interface BuildBreakdownOptions {
  vehiclesById: VehicleLookup;
  metric: StatsMetric;
  dimension: StatsDimension;
}

/**
 * Rangliste über eine Dimension. Abschnitte ohne Fahrt fallen weg; ein
 * Abschnitt mit Fahrten, aber ohne Beitrag zur Kennzahl (ein Anhänger hat keine
 * Kilometer) bleibt mit dem Wert 0 — sonst verschwände eine erfasste Fahrt aus
 * der Auswertung.
 */
export function buildBreakdown(
  entries: FahrtenbuchEntry[],
  options: BuildBreakdownOptions,
): StatsSlice[] {
  const { vehiclesById, metric, dimension } = options;
  const slices = new Map<string, StatsSlice>();

  for (const entry of entries) {
    const vehicle = vehiclesById.get(entry.vehicleId);
    const [contribution] = stackContributions(entry, vehicle, metric, dimension);
    if (!contribution) continue;
    // Eine Rangliste der Fahrer ohne Fahrer wäre eine Zeile ohne Aussage.
    if (contribution.key === NO_DRIVER_STACK_KEY) continue;
    const slice = slices.get(contribution.key) ?? {
      key: contribution.key,
      label: contribution.label,
      value: 0,
      trips: 0,
    };
    slice.value = round(slice.value + contribution.value);
    slice.trips += 1;
    slices.set(contribution.key, slice);
  }

  if (dimension === 'zweck') {
    return FAHRT_ZWECKE.filter((zweck) => slices.has(zweck)).map(
      (zweck) => slices.get(zweck) as StatsSlice,
    );
  }
  return [...slices.values()].sort(
    (a, b) => b.value - a.value || b.trips - a.trips || a.label.localeCompare(b.label),
  );
}

export interface DriverStat {
  key: string;
  name: string;
  trips: number;
  durationMinutes: number;
  /** Je Einheit die Summe der Zählerdifferenzen. */
  counterTotals: Record<string, number>;
  /** Zahl der verschiedenen Fahrzeuge, die dieser Fahrer bewegt hat. */
  vehicleCount: number;
  lastEntryAt?: string;
  defects: number;
  zwecke: Record<FahrtZweck, number>;
}

function emptyZwecke(): Record<FahrtZweck, number> {
  return { einsatz: 0, uebung: 0, versorgung: 0, sonstiges: 0 };
}

/**
 * Auswertung je Fahrer, absteigend nach Fahrten.
 *
 * Einheiten ohne Fahrer (Anhänger, Wechselladeaufbau) bleiben außen vor — sie
 * werden gezogen, nicht gefahren.
 */
export function buildDriverStats(
  entries: FahrtenbuchEntry[],
  vehiclesById: VehicleLookup,
): DriverStat[] {
  const stats = new Map<string, DriverStat & { vehicles: Set<string> }>();

  for (const entry of entries) {
    const key = driverKeyOf(entry);
    if (!key) continue;
    const stat =
      stats.get(key) ??
      ({
        key,
        name: entry.driverName?.trim() || key,
        trips: 0,
        durationMinutes: 0,
        counterTotals: {},
        vehicleCount: 0,
        defects: 0,
        zwecke: emptyZwecke(),
        vehicles: new Set<string>(),
      } satisfies DriverStat & { vehicles: Set<string> });

    stat.trips += 1;
    stat.durationMinutes += entryDurationMinutes(entry) ?? 0;
    if (entry.defekt) stat.defects += 1;
    stat.vehicles.add(entry.vehicleId);
    if (entry.zweck in stat.zwecke) stat.zwecke[entry.zweck] += 1;
    // Die jüngste Fahrt bestimmt Schreibweise und Datum; `entries` kommt
    // absteigend nach Abfahrt herein, die Prüfung hält aber auch andere
    // Reihenfolgen aus.
    if (!stat.lastEntryAt || entry.abfahrt > stat.lastEntryAt) {
      stat.lastEntryAt = entry.abfahrt;
      if (entry.driverName?.trim()) stat.name = entry.driverName.trim();
    }
    for (const [unit, value] of Object.entries(
      counterDiffsByUnit(entry, vehiclesById.get(entry.vehicleId)),
    )) {
      stat.counterTotals[unit] = round((stat.counterTotals[unit] ?? 0) + value);
    }
    stats.set(key, stat);
  }

  return [...stats.values()]
    .map(({ vehicles, ...stat }) => ({ ...stat, vehicleCount: vehicles.size }))
    .sort((a, b) => b.trips - a.trips || a.name.localeCompare(b.name));
}

export interface VehicleFuelStat {
  vehicleId: string;
  name: string;
  liters: Partial<Record<FuelType, number>>;
  fuelLiters: number;
  distanceKm: number;
  /** Näherung; nur mit Kilometern und getanktem Kraftstoff. */
  consumptionPer100Km?: number;
}

export interface FuelStats {
  perVehicle: VehicleFuelStat[];
  totals: Partial<Record<FuelType, number>>;
}

/**
 * Betriebsmittel je Fahrzeug samt genähertem Verbrauch.
 *
 * Der Verbrauch ist eine Näherung und keine Messung: Eine Tankung füllt den
 * Tank für Fahrten, die teils außerhalb des Zeitraums liegen. Über ein Jahr
 * gleicht sich das aus, über eine Woche nicht — die Oberfläche weist das aus.
 */
export function buildFuelStats(
  entries: FahrtenbuchEntry[],
  vehiclesById: VehicleLookup,
): FuelStats {
  const perVehicle = new Map<string, VehicleFuelStat>();
  const totals: Partial<Record<FuelType, number>> = {};

  for (const entry of entries) {
    const vehicle = vehiclesById.get(entry.vehicleId);
    const stat =
      perVehicle.get(entry.vehicleId) ??
      ({
        vehicleId: entry.vehicleId,
        name: vehicle?.name ?? entry.vehicleName ?? entry.vehicleId,
        liters: {},
        fuelLiters: 0,
        distanceKm: 0,
      } satisfies VehicleFuelStat);

    for (const fuel of FUEL_TYPES) {
      const amount = entry.betriebsmittel?.[fuel];
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        continue;
      }
      stat.liters[fuel] = round((stat.liters[fuel] ?? 0) + amount);
      stat.fuelLiters = round(stat.fuelLiters + amount);
      totals[fuel] = round((totals[fuel] ?? 0) + amount);
    }
    stat.distanceKm = round(
      stat.distanceKm + (counterDiffsByUnit(entry, vehicle)[DISTANCE_UNIT] ?? 0),
    );
    perVehicle.set(entry.vehicleId, stat);
  }

  const result = [...perVehicle.values()]
    .filter((stat) => stat.fuelLiters > 0 || stat.distanceKm > 0)
    .map((stat) => {
      const consumptionLiters = CONSUMPTION_FUELS.reduce(
        (sum, fuel) => sum + (stat.liters[fuel] ?? 0),
        0,
      );
      return {
        ...stat,
        consumptionPer100Km:
          stat.distanceKm > 0 && consumptionLiters > 0
            ? round((consumptionLiters / stat.distanceKm) * 100)
            : undefined,
      };
    })
    .sort(
      (a, b) =>
        b.fuelLiters - a.fuelLiters ||
        b.distanceKm - a.distanceKm ||
        a.name.localeCompare(b.name),
    );

  return { perVehicle: result, totals };
}
