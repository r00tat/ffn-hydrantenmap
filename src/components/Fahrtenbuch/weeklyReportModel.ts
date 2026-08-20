/**
 * Das Datenmodell des Wochenberichts — reine Funktionen, ohne Firestore, ohne
 * MIME und ohne next-intl.
 *
 * Getrennt vom Mailbau, weil die Plausibilitätsprüfung die eigentliche Logik
 * des Berichts ist: Sie muss prüfbar bleiben, ohne eine Mail zu bauen.
 * Dieselbe Aufteilung wie beim PDF-Export.
 */

import {
  driverNamesOf,
  type CounterDefinition,
  type CounterReading,
  type FahrtenbuchEntry,
  type FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import { isOpenMangel, type Mangel } from '../../common/mangel';
import {
  counterDefinitions,
  formatDate,
  formatTimeRange,
  usedFuelTypes,
} from './fahrtenbuchExportModel';
import {
  FUEL_LABELS,
  FUEL_UNIT,
  OPEN_MANGEL_STATUS_LABELS,
  ZWECK_LABELS,
} from './germanLabels';
import { REPORT_TIME_ZONE, type ReportPeriod } from './weeklyReportPeriod';

export interface WeeklyReportRowCounter {
  label: string;
  unit: string;
  start?: number;
  end?: number;
  diff?: number;
  /** Endstand abgeleitet, nicht abgelesen — im Bericht als „ca." gekennzeichnet. */
  estimated: boolean;
}

export interface WeeklyReportRowFuel {
  label: string;
  unit: string;
  amount: number;
}

export interface WeeklyReportRow {
  date: string;
  timeRange: string;
  driver: string;
  zweck: string;
  ziel: string;
  counters: WeeklyReportRowCounter[];
  fuel: WeeklyReportRowFuel[];
  note?: string;
  defekt: boolean;
}

export type WeeklyReportWarning =
  | {
      kind: 'gap';
      counterLabel: string;
      unit: string;
      previousEnd: number;
      nextStart: number;
      date: string;
    }
  | {
      kind: 'overlap';
      counterLabel: string;
      unit: string;
      previousEnd: number;
      nextStart: number;
      date: string;
    }
  /**
   * Der Startstand liegt unter dem Vorgänger, das Ende trifft aber genau
   * dessen Startstand: Die Kette passt in umgekehrter Reihenfolge, die Fahrt
   * ist also nachgetragen. Nicht der Zählerstand ist falsch, sondern die
   * Uhrzeit — deshalb eine eigene Art und nicht `overlap`.
   */
  | {
      kind: 'outOfOrder';
      counterLabel: string;
      unit: string;
      /** Endstand der nach Uhrzeit vorigen Fahrt. */
      previousEnd: number;
      /** Startstand dieser Fahrt. */
      nextStart: number;
      date: string;
    }
  | {
      kind: 'decrease';
      counterLabel: string;
      unit: string;
      start: number;
      end: number;
      date: string;
    }
  | { kind: 'missing'; counterLabel: string; date: string };

export interface WeeklyReportTotal {
  label: string;
  unit: string;
  value: number;
}

export interface WeeklyReportVehicle {
  vehicleId: string;
  /** „KDTFA (ND-1)" */
  heading: string;
  /** Leer heißt: keine Fahrten im Zeitraum. */
  rows: WeeklyReportRow[];
  totals: WeeklyReportTotal[];
  warnings: WeeklyReportWarning[];
}

export interface WeeklyReportMangel {
  vehicleName: string;
  status: 'open' | 'inProgress';
  statusLabel: string;
  description: string;
  reportedAt: string;
  reportedByName: string;
  /**
   * Nur die Anzahl, nicht die Bilder selbst: Die Mail geht an Werkstatt und
   * Gerätewart und soll klein bleiben, und ein Anhang bräuchte eine
   * Berechtigungsprüfung, die eine Mail nicht hat. Der Hinweis sagt, dass es
   * im Fahrtenbuch mehr zu sehen gibt.
   */
  imageCount: number;
}

export interface WeeklyReportModel {
  groupId: string;
  groupName?: string;
  period: ReportPeriod;
  vehicles: WeeklyReportVehicle[];
  openMangel: WeeklyReportMangel[];
  entryCount: number;
  hasWarnings: boolean;
}

export interface BuildWeeklyReportOptions {
  groupId: string;
  groupName?: string;
  period: ReportPeriod;
  /** Die Fahrzeuge in der Reihenfolge der Ausgabe. */
  vehicles: FahrtenbuchVehicle[];
  /** Fahrten des Zeitraums, Reihenfolge beliebig. */
  entries: FahrtenbuchEntry[];
  /** Je Fahrzeug-ID die letzte Fahrt vor dem Zeitraum. */
  previousEntries: Record<string, FahrtenbuchEntry | undefined>;
  openMangel: Mangel[];
  timeZone?: string;
}

/**
 * Ob ein Zähler den Vergleich zweier Stände zulässt.
 *
 * Bei einem Ablesezähler (`reading`, etwa eine Lenzpumpe) ist ein Sprung
 * zwischen zwei Fahrten der Sinn der Sache und kein Erfassungsfehler, und
 * `changeWarning: 'none'` heißt in den Stammdaten ausdrücklich „hier nicht
 * warnen".
 */
function comparable(def: CounterDefinition): boolean {
  return def.mode === 'startEnd' && def.changeWarning !== 'none';
}

function readingOf(
  entry: FahrtenbuchEntry,
  counterId: string,
): CounterReading | undefined {
  return entry.counters?.[counterId];
}

/**
 * Warnungen eines Fahrzeugs.
 *
 * `entries` ist aufsteigend nach `abfahrt` sortiert, `previous` die letzte
 * Fahrt vor dem Zeitraum. Ohne diesen Vorgänger fiele genau der Fall nicht auf,
 * um den es geht: der falsche Zählerstand am Wochenanfang. `lastEnd` bleibt
 * `undefined`, solange es keinen Vergleichswert gibt — daran hängt, dass die
 * erste Fahrt eines Fahrzeugs ohne Vorgeschichte keine Warnung auslöst.
 */
function vehicleWarnings(
  definitions: CounterDefinition[],
  entries: FahrtenbuchEntry[],
  previous: FahrtenbuchEntry | undefined,
  timeZone: string,
): WeeklyReportWarning[] {
  const warnings: WeeklyReportWarning[] = [];

  for (const def of definitions) {
    let lastEnd =
      comparable(def) && previous ? readingOf(previous, def.id)?.end : undefined;
    // Der Startstand des Vergleichswerts. Nur damit ist ein Nachtrag von einem
    // falschen Zählerstand zu unterscheiden: Trifft das Ende einer Fahrt genau
    // diesen Startstand, passt die Kette in umgekehrter Reihenfolge.
    let lastStart =
      comparable(def) && previous
        ? readingOf(previous, def.id)?.start
        : undefined;

    for (const entry of entries) {
      const date = formatDate(entry.abfahrt, timeZone);
      const reading = readingOf(entry, def.id);
      const start = reading?.start;
      const end = reading?.end;

      // Ein fehlender Pflichtwert ist bei jedem Zähler eine Lücke im Nachweis —
      // unabhängig vom Modus.
      const missing =
        def.required &&
        (end === undefined || (def.mode === 'startEnd' && start === undefined));
      // Eine nachgetragene Fahrt darf die Vergleichswerte nicht verschieben,
      // siehe unten.
      let lateEntry = false;
      if (missing) {
        warnings.push({ kind: 'missing', counterLabel: def.label, date });
      }

      // Bei einer unvollständigen Fahrt bleibt es bei dieser einen Meldung: Wer
      // ihr nachgeht, sieht die Stände ohnehin an. Zwei Warnungen zur selben
      // Zeile lesen sich wie zwei Fehler.
      if (comparable(def) && !missing) {
        if (start !== undefined && lastEnd !== undefined) {
          if (start > lastEnd) {
            warnings.push({
              kind: 'gap',
              counterLabel: def.label,
              unit: def.unit,
              previousEnd: lastEnd,
              nextStart: start,
              date,
            });
          } else if (start < lastEnd) {
            // Trifft das Ende dieser Fahrt genau den Startstand der vorigen,
            // ergeben beide zusammen eine lückenlose Kette — nur in der
            // anderen Reihenfolge. Dann ist die Fahrt nachgetragen und der
            // Zählerstand in Ordnung.
            lateEntry = end !== undefined && end === lastStart;
            warnings.push({
              kind: lateEntry ? 'outOfOrder' : 'overlap',
              counterLabel: def.label,
              unit: def.unit,
              previousEnd: lastEnd,
              nextStart: start,
              date,
            });
          }
        }

        if (start !== undefined && end !== undefined && end < start) {
          warnings.push({
            kind: 'decrease',
            counterLabel: def.label,
            unit: def.unit,
            start,
            end,
            date,
          });
        }
      }

      // Ein bekannter Endstand ist der Vergleichswert der nächsten Fahrt, auch
      // wenn an dieser Fahrt ein Pflichtwert fehlt: Sonst prüfte die nächste
      // Fahrt gegen einen veralteten Stand und schlüge als Lücke auf, obwohl
      // ihr Startstand zum letzten erfassten Ende passt. Fehlt das Ende, bleibt
      // der Vorgängerwert stehen — die Kette der Woche reißt an einer
      // unvollständigen Fahrt nicht ab.
      //
      // Ein Nachtrag ist die Ausnahme: Er beschreibt einen früheren Abschnitt
      // und verschiebt den Stand des Fahrzeugs nicht. Würde der Vergleichswert
      // auf sein Ende zurückfallen, bekäme die nächste Fahrt eine Lücke
      // gemeldet, die es nicht gibt — ein Erfassungsfehler, zwei Warnungen.
      if (comparable(def) && end !== undefined && !lateEntry) {
        lastEnd = end;
        lastStart = start;
      }
    }
  }

  return warnings;
}

function rowNote(entry: FahrtenbuchEntry): string | undefined {
  const mangel = entry.mangel?.trim();
  // Der Mangeltext hängt am Vermerk und steht nicht daneben — sonst ließe der
  // Vermerk offen, ob er zum Defekt gehört oder eine Bemerkung ist. Dieselbe
  // Bauweise wie im PDF-Export.
  const parts = [
    entry.hinweise?.trim(),
    entry.defekt
      ? mangel
        ? `Defekt gemeldet: ${mangel}`
        : 'Defekt gemeldet'
      : undefined,
  ].filter((part): part is string => !!part);
  return parts.length > 0 ? parts.join(' — ') : undefined;
}

export function buildWeeklyReportModel(
  options: BuildWeeklyReportOptions,
): WeeklyReportModel {
  const {
    groupId,
    groupName,
    period,
    vehicles,
    entries,
    previousEntries,
    openMangel,
    timeZone = REPORT_TIME_ZONE,
  } = options;

  let entryCount = 0;

  const reportVehicles = vehicles.map<WeeklyReportVehicle>((vehicle) => {
    // Fahrzeuge kommen aus Firestore und haben eine ID; `id` ist nur wegen des
    // noch nicht gespeicherten Formulars optional.
    const vehicleId = vehicle.id ?? '';
    const vehicleEntries = entries
      .filter((e) => !e.deleted && e.vehicleId === vehicleId)
      .sort((a, b) => a.abfahrt.localeCompare(b.abfahrt));
    entryCount += vehicleEntries.length;

    const definitions = counterDefinitions(vehicle, vehicleEntries);
    const fuels = usedFuelTypes(vehicle, vehicleEntries);
    const totals = new Map<string, number>();

    const rows = vehicleEntries.map<WeeklyReportRow>((entry) => {
      const counters = definitions.map<WeeklyReportRowCounter>((def) => {
        const reading = readingOf(entry, def.id);
        // Die Differenz aus Start und Ende, sonst der mitgeführte Wert —
        // dieselbe Regel wie im PDF-Export.
        const diff =
          reading?.start !== undefined && reading?.end !== undefined
            ? reading.end - reading.start
            : reading?.diff;
        if (diff !== undefined && Number.isFinite(diff)) {
          totals.set(def.id, (totals.get(def.id) ?? 0) + diff);
        }
        return {
          label: def.label,
          unit: def.unit,
          start: reading?.start,
          end: reading?.end,
          diff,
          // Gilt für den Endstand und die daraus folgende Differenz; ein
          // Startstand ist immer abgelesen — wie im PDF-Export.
          estimated: entry.counterSources?.[def.id] === 'estimate',
        };
      });

      return {
        date: formatDate(entry.abfahrt, timeZone),
        timeRange: formatTimeRange(entry, timeZone),
        driver: driverNamesOf(entry),
        zweck: ZWECK_LABELS[entry.zweck] ?? entry.zweck,
        ziel: entry.ziel?.trim() || entry.firecallName?.trim() || '',
        counters,
        fuel: fuels
          .map<WeeklyReportRowFuel | undefined>((fuel) => {
            const amount = entry.betriebsmittel?.[fuel];
            if (typeof amount !== 'number' || !(amount > 0)) return undefined;
            return { label: FUEL_LABELS[fuel], unit: FUEL_UNIT, amount };
          })
          .filter((f): f is WeeklyReportRowFuel => !!f),
        note: rowNote(entry),
        defekt: !!entry.defekt,
      };
    });

    return {
      vehicleId,
      // `name` ist im Typ Pflicht, ein Dokument aus Firestore kann es dennoch
      // vermissen lassen — die Sortierung in `sendWeeklyReports` fängt das
      // schon ab. Ohne Rückfall käme hier ein `undefined` in die Überschrift
      // und `heading.length` im Textteil der Mail würde werfen: Der Bericht der
      // ganzen Gruppe fiele wegen eines Fahrzeugs aus.
      heading: vehicle.kennzeichen?.trim()
        ? `${vehicle.name ?? ''} (${vehicle.kennzeichen.trim()})`.trim()
        : (vehicle.name ?? ''),
      rows,
      // Nur Zähler mit erfassten Werten: Eine Summe „0 km" behauptete, das
      // Fahrzeug sei keinen Meter gefahren, obwohl niemand etwas eingetragen hat.
      totals: definitions
        .filter((def) => totals.has(def.id))
        .map<WeeklyReportTotal>((def) => ({
          label: def.label,
          unit: def.unit,
          value: totals.get(def.id) as number,
        })),
      warnings: vehicleWarnings(
        definitions,
        vehicleEntries,
        previousEntries[vehicleId],
        timeZone,
      ),
    };
  });

  const mangel = openMangel.filter(isOpenMangel).map<WeeklyReportMangel>((m) => {
    // `isOpenMangel` lässt alles außer `resolved` durch — auch einen Status, den
    // es heute noch nicht gibt. Der Bericht führt ihn dann wie einen offenen
    // Mangel, statt ihn per Cast als etwas auszugeben, was er nicht ist:
    // sichtbar bleiben ist wichtiger als genau beschriftet zu sein, und ein
    // stiller Verlust wäre das Schlechteste von allem.
    const status = m.status === 'inProgress' ? 'inProgress' : 'open';
    return {
      vehicleName: m.vehicleName,
      status,
      statusLabel: OPEN_MANGEL_STATUS_LABELS[status],
      description: m.description,
      reportedAt: formatDate(m.reportedAt, timeZone),
      reportedByName: m.reportedByName,
      imageCount: m.images?.length ?? 0,
    };
  });

  return {
    groupId,
    groupName,
    period,
    vehicles: reportVehicles,
    openMangel: mangel,
    entryCount,
    hasWarnings: reportVehicles.some((v) => v.warnings.length > 0),
  };
}
