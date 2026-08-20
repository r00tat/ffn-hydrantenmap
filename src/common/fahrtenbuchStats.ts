/**
 * Die Grundrechenarten der Fahrtenbuch-Statistik: was eine einzelne Fahrt zu
 * einer Kennzahl beiträgt, welche Fahrten in den gewählten Ausschnitt fallen
 * und in welchen Zeitabschnitt sie gehören.
 *
 * Reine Funktionen, ohne React, Firestore und next-intl — dieselbe Aufteilung
 * wie beim PDF-Export, wo das Modell (`fahrtenbuchExportModel.ts`) neben dem
 * Renderer steht. Die Zusammenfassungen darauf stehen in
 * `fahrtenbuchStatsSeries.ts`.
 */

import {
  driverIdentities,
  FUEL_TYPES,
  normalizeName,
  type FahrtZweck,
  type FahrtenbuchEntry,
  type FahrtenbuchVehicle,
} from './fahrtenbuch';
import {
  addDays,
  daysBetween,
  isoWeek,
  isoWeekMonday,
  lastDayOfMonth,
  parseIsoDay,
  toIsoDay,
  zonedParts,
} from './zonedDay';

/**
 * Die auswertbare Größe einer Fahrt.
 *
 * `unit:<einheit>` ist die Summe der Zählerdifferenzen dieser Einheit, etwa
 * `unit:km` für die Strecke und `unit:h` für Betriebsstunden. Bewusst über die
 * Einheit und nicht über eine feste Liste von Kennzahlen: Zähler sind in den
 * Stammdaten frei definierbar, und ein Boot hat keine Kilometer.
 */
export type StatsMetric = 'trips' | 'duration' | 'fuel' | `unit:${string}`;

export type StatsGranularity = 'day' | 'week' | 'month' | 'year';

/** Wonach eine Auswertung aufgeteilt wird. */
export type StatsDimension = 'zweck' | 'vehicle' | 'driver';

export interface StatsFilter {
  /** Erster Tag, `YYYY-MM-DD`. */
  from: string;
  /** Letzter Tag, `YYYY-MM-DD`. */
  to: string;
  /** Leere Liste heißt „alle Fahrzeuge". */
  vehicleIds: string[];
  /** Leere Liste heißt „alle Fahrtzwecke". */
  zwecke: FahrtZweck[];
  /** Schlüssel aus `driverKeyOf`; ohne Angabe alle Fahrer. */
  driverKey?: string;
  onlyDefects?: boolean;
}

export const DEFAULT_STATS_TIME_ZONE = 'Europe/Vienna';

/** Die Zone des Browsers; im Server-Rendering und ohne Intl die Vorgabe. */
export function browserTimeZone(): string {
  try {
    return (
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      DEFAULT_STATS_TIME_ZONE
    );
  } catch {
    return DEFAULT_STATS_TIME_ZONE;
  }
}

export function isUnitMetric(metric: StatsMetric): boolean {
  return metric.startsWith('unit:');
}

export function metricUnit(metric: StatsMetric): string | undefined {
  return isUnitMetric(metric) ? metric.slice('unit:'.length) : undefined;
}

export function unitMetric(unit: string): StatsMetric {
  return `unit:${unit}`;
}

/**
 * Die Differenz auf zwei Dezimalstellen. `end - start` liefert für
 * Betriebsstunden wie 1246,1 − 1245 den Wert 1,0999999999999943 — in einer
 * Summe über hundert Fahrten wäre das sichtbar.
 */
function roundDiff(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Die Einheiten aller Zähler, die eine Differenz bilden können — die
 * auswertbaren Streckenmaße der Gruppe. Kilometer stehen vorne, weil sie der
 * Regelfall sind; der Rest folgt alphabetisch.
 *
 * Ablesezähler (`mode: 'reading'`, etwa eine Lenzpumpe) fehlen bewusst: Ihre
 * Werte sind Stände, keine Zuwächse. Eine Summe darüber wäre eine Zahl ohne
 * Bedeutung.
 */
export function counterUnitsOf(vehicles: FahrtenbuchVehicle[]): string[] {
  const units = new Set<string>();
  for (const vehicle of vehicles) {
    for (const def of vehicle.counters ?? []) {
      if (def.mode !== 'startEnd') continue;
      const unit = def.unit?.trim();
      if (unit) units.add(unit);
    }
  }
  return [...units].sort((a, b) => {
    if (a === 'km') return -1;
    if (b === 'km') return 1;
    return a.localeCompare(b);
  });
}

/**
 * Was diese Fahrt je Einheit zurückgelegt hat.
 *
 * Die Differenz wird aus Start und Ende neu gerechnet und nicht aus dem
 * mitgeführten `diff` gelesen — ein gespeichertes `diff` kann einer späteren
 * Korrektur widersprechen. Ein negativer Wert fällt weg: Ein Kilometerzähler
 * läuft nicht zurück, das kann nur ein Erfassungsfehler sein, und in einer
 * Summe würde er stillschweigend abziehen.
 *
 * Ohne die Zählerdefinitionen des Fahrzeugs ist die Einheit unbekannt; solche
 * Werte gehen in keine Summe ein.
 */
export function counterDiffsByUnit(
  entry: Pick<FahrtenbuchEntry, 'counters'>,
  vehicle: Pick<FahrtenbuchVehicle, 'counters'> | undefined,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const def of vehicle?.counters ?? []) {
    if (def.mode !== 'startEnd') continue;
    const unit = def.unit?.trim();
    if (!unit) continue;
    const reading = entry.counters?.[def.id];
    if (!reading) continue;
    const { start, end } = reading;
    const raw =
      start !== undefined && end !== undefined ? end - start : reading.diff;
    if (raw === undefined || !Number.isFinite(raw) || raw < 0) continue;
    result[unit] = roundDiff((result[unit] ?? 0) + raw);
  }
  return result;
}

/** Dauer der Fahrt in Minuten; `undefined`, wenn die Zeiten das nicht hergeben. */
export function entryDurationMinutes(
  entry: Pick<FahrtenbuchEntry, 'abfahrt' | 'ankunft'>,
): number | undefined {
  const departure = Date.parse(entry.abfahrt ?? '');
  const arrival = Date.parse(entry.ankunft ?? '');
  if (Number.isNaN(departure) || Number.isNaN(arrival)) return undefined;
  if (arrival < departure) return undefined;
  return Math.round((arrival - departure) / 60000);
}

/** Getankte Menge in Litern über alle Betriebsmittel. */
export function entryFuelLiters(
  entry: Pick<FahrtenbuchEntry, 'betriebsmittel'>,
): number {
  let sum = 0;
  for (const fuel of FUEL_TYPES) {
    const amount = entry.betriebsmittel?.[fuel];
    if (typeof amount !== 'number' || !Number.isFinite(amount)) continue;
    if (amount <= 0) continue;
    sum += amount;
  }
  return roundDiff(sum);
}

/** Der Beitrag einer Fahrt zur Kennzahl; `0`, wenn sie nichts beiträgt. */
export function metricValue(
  entry: FahrtenbuchEntry,
  vehicle: FahrtenbuchVehicle | undefined,
  metric: StatsMetric,
): number {
  if (metric === 'trips') return 1;
  if (metric === 'duration') return entryDurationMinutes(entry) ?? 0;
  if (metric === 'fuel') return entryFuelLiters(entry);
  const unit = metricUnit(metric);
  if (!unit) return 0;
  return counterDiffsByUnit(entry, vehicle)[unit] ?? 0;
}

/**
 * Der Schlüssel, unter dem die Fahrten eines Fahrers zusammenlaufen: die
 * verknüpfte Person, sonst der normalisierte Name. Ohne den Namensrückfall
 * zerfiele ein Fahrer, der teils aus der Personenliste und teils frei
 * eingetippt wurde, in mehrere Zeilen; „Max  MUSTER" und „Max Muster" sind
 * dieselbe Person.
 *
 * Leer bei einer Einheit ohne Fahrer (Anhänger, Wechselladeaufbau).
 *
 * Nur der Hauptfahrer. Alle Fahrer einer Fahrt samt Anteil liefert
 * `driverSharesOf`.
 */
export function driverKeyOf(
  entry: Pick<FahrtenbuchEntry, 'driverId' | 'driverName'>,
): string {
  if (entry.driverId?.trim()) return entry.driverId.trim();
  return normalizeName(entry.driverName ?? '');
}

/** Ein Fahrer einer Fahrt samt seinem Anteil daran. */
export interface EntryDriverShare {
  /** Schlüssel wie `driverKeyOf`: Personen-ID, sonst normalisierter Name. */
  key: string;
  name: string;
  /** `1 / Anzahl der Fahrer dieser Fahrt`. */
  share: number;
}

type EntryDrivers = Pick<
  FahrtenbuchEntry,
  'driverId' | 'driverName' | 'coDrivers'
>;

/**
 * Alle Fahrer einer Fahrt mit gleichmäßigem Anteil, Hauptfahrer zuerst.
 *
 * Eine Fahrt, auf der sich zwei Personen abgewechselt haben, hat ihre Kilometer
 * nur einmal. Würden sie jedem Beteiligten voll zugerechnet, wäre die Summe der
 * Fahrer höher als die Gesamtsumme — ein nach Fahrer gestapelter Balken stünde
 * dann über der Kennzahl, und die Differenz wäre niemandem zu erklären.
 *
 * Leer bei einer Einheit ohne Fahrer (Anhänger, Wechselladeaufbau).
 *
 * Entdoppelt wird erneut, obwohl das schon beim Schreiben passiert: Altdaten
 * und eine spätere Umbenennung dürfen nicht zu einem halben Anteil bei einem
 * einzigen Menschen führen.
 */
export function driverSharesOf(entry: EntryDrivers): EntryDriverShare[] {
  const refs = [
    { id: entry.driverId, name: entry.driverName ?? '' },
    ...(entry.coDrivers ?? []),
  ];
  const seen = new Set<string>();
  const drivers: { key: string; name: string }[] = [];
  for (const ref of refs) {
    const name = ref?.name?.trim();
    if (!name) continue;
    const tokens = driverIdentities({ id: ref.id, name });
    if (tokens.length === 0 || tokens.some((token) => seen.has(token))) continue;
    for (const token of tokens) seen.add(token);
    drivers.push({ key: ref.id?.trim() || normalizeName(name), name });
  }
  const share = drivers.length > 0 ? 1 / drivers.length : 0;
  return drivers.map((driver) => ({ ...driver, share }));
}

/**
 * Der Anteil, mit dem eine Fahrt in eine Auswertung eingeht.
 *
 * Ohne Fahrerbezug die ganze Fahrt. Ist ein Fahrer genannt — der gesetzte
 * Fahrerfilter —, sein Anteil daran: Sonst stünde über einer Fahrer-Tabelle,
 * die 700 km ausweist, eine Kennzahl von 1000 km für dieselbe Auswahl. `0` für
 * einen Unbeteiligten; der Filter hat solche Fahrten normalerweise schon
 * entfernt.
 */
export function entryDriverShare(
  entry: EntryDrivers,
  driverKey: string | undefined,
): number {
  if (!driverKey) return 1;
  return driverSharesOf(entry).find((s) => s.key === driverKey)?.share ?? 0;
}

/** Ob mindestens ein Endstand dieser Fahrt geschätzt und nicht belegt ist. */
export function hasEstimatedCounter(
  entry: Pick<FahrtenbuchEntry, 'counterSources'>,
): boolean {
  return Object.values(entry.counterSources ?? {}).some(
    (source) => source === 'estimate',
  );
}

/**
 * Die Fahrten des gewählten Ausschnitts.
 *
 * Der Zeitraum wird hier nochmals angewandt, obwohl schon die Abfrage danach
 * eingrenzt: Beim Verfeinern eines Zeitraums (Klick auf einen Monatsbalken)
 * liegt für einen Moment noch das breitere Ergebnis vor, und die Auswertung
 * soll in diesem Moment nicht zu viel zeigen.
 */
export function filterStatsEntries(
  entries: FahrtenbuchEntry[],
  filter: StatsFilter,
  timeZone: string,
): FahrtenbuchEntry[] {
  const vehicleIds = new Set(filter.vehicleIds ?? []);
  const zwecke = new Set(filter.zwecke ?? []);
  return entries.filter((entry) => {
    if (entry.deleted) return false;
    if (vehicleIds.size > 0 && !vehicleIds.has(entry.vehicleId)) return false;
    if (zwecke.size > 0 && !zwecke.has(entry.zweck)) return false;
    if (
      filter.driverKey &&
      !driverSharesOf(entry).some((s) => s.key === filter.driverKey)
    ) {
      return false;
    }
    if (filter.onlyDefects && !entry.defekt) return false;
    const day = zonedParts(entry.abfahrt, timeZone)?.isoDay;
    if (!day) return false;
    if (filter.from && day < filter.from) return false;
    if (filter.to && day > filter.to) return false;
    return true;
  });
}

/**
 * Das Zeitraster, das zur Länge des Zeitraums passt. Vorbelegung, keine
 * Festlegung — die Oberfläche lässt es umschalten.
 */
export function suggestGranularity(from: string, to: string): StatsGranularity {
  const days = daysBetween(from, to);
  if (days <= 0) return 'month';
  if (days <= 31) return 'day';
  if (days <= 92) return 'week';
  if (days <= 3 * 366) return 'month';
  return 'year';
}

/** Eine Stufe feiner — der nächste Schritt beim Hineinzoomen. */
export function finerGranularity(
  granularity: StatsGranularity,
): StatsGranularity {
  if (granularity === 'year') return 'month';
  if (granularity === 'month') return 'day';
  return 'day';
}

/** Der Zeitabschnitt, in den ein Zeitpunkt fällt: `2025-03`, `2025-W11`, … */
export function bucketKeyOf(
  iso: string,
  granularity: StatsGranularity,
  timeZone: string,
): string | undefined {
  const parts = zonedParts(iso, timeZone);
  if (!parts) return undefined;
  return bucketKeyOfDay(parts.isoDay, granularity);
}

/** Derselbe Schlüssel, aber aus einem Kalendertag statt einem Zeitpunkt. */
export function bucketKeyOfDay(
  day: string,
  granularity: StatsGranularity,
): string | undefined {
  const parts = parseIsoDay(day);
  if (!parts) return undefined;
  if (granularity === 'day') return day;
  if (granularity === 'month') return day.slice(0, 7);
  if (granularity === 'year') return day.slice(0, 4);
  const { year, week } = isoWeek(parts.year, parts.month, parts.day);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * Alle Zeitabschnitte des Zeitraums in Reihenfolge — auch die ohne Fahrt.
 *
 * Über die Tage des Zeitraums gebildet und nicht je Raster einzeln gerechnet:
 * Das ist für jedes Raster dieselbe Schleife und liefert die Wochen über
 * Jahresgrenzen richtig (`2024-W52` vor `2025-W01`). Ein Zeitraum von zehn
 * Jahren sind 3653 Durchläufe — nicht der Rede wert.
 */
export function bucketKeysBetween(
  from: string,
  to: string,
  granularity: StatsGranularity,
): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const days = daysBetween(from, to);
  let day = from;
  for (let i = 0; i < days; i += 1) {
    const key = bucketKeyOfDay(day, granularity);
    if (key && !seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
    day = addDays(day, 1);
  }
  return keys;
}

/** Der Zeitraum, den ein Abschnitt abdeckt — die Grundlage des Drill-downs. */
export function bucketDayRange(
  key: string,
  granularity: StatsGranularity,
): { from: string; to: string } | undefined {
  if (granularity === 'day') {
    return parseIsoDay(key) ? { from: key, to: key } : undefined;
  }
  if (granularity === 'year') {
    if (!/^\d{4}$/.test(key)) return undefined;
    return { from: `${key}-01-01`, to: `${key}-12-31` };
  }
  if (granularity === 'month') {
    if (!/^\d{4}-\d{2}$/.test(key)) return undefined;
    const [year, month] = key.split('-').map(Number);
    if (month < 1 || month > 12) return undefined;
    return {
      from: `${key}-01`,
      to: toIsoDay(year, month, lastDayOfMonth(year, month)),
    };
  }
  const match = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!match) return undefined;
  const monday = isoWeekMonday(Number(match[1]), Number(match[2]));
  return { from: monday, to: addDays(monday, 6) };
}
