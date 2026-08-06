/**
 * Das Datenmodell des PDF-Exports — reine Funktionen, ohne react-pdf, ohne
 * Firestore und ohne next-intl.
 *
 * Die Aufteilung ist Absicht: Die Zuordnung von Zählern zu Spalten und von
 * Fahrten zu Zellen ist die eigentliche Logik des Exports und muss prüfbar
 * bleiben, ohne ein PDF zu rendern. Die Beschriftungen kommen über einen
 * `translate`-Rückruf herein, damit das Modell die Sprache des Benutzers
 * spricht, ohne von der Übersetzungsbibliothek abzuhängen.
 *
 * Die Spaltenordnung folgt dem Ausdruck des bisherigen digitalen Fahrtenbuchs
 * (Datum, Zeit, Fahrer, Grund, Zweck/Strecke, Zählerstände, Betriebsmittel,
 * Notizen) — dieselbe Tabelle, die der PDF-Import wieder lesen kann.
 */

import {
  FUEL_TYPES,
  type CounterDefinition,
  type CounterReading,
  type FahrtenbuchEntry,
  type FahrtenbuchVehicle,
  type FuelType,
} from '../../common/fahrtenbuch';

/**
 * Wie `t` von next-intl, aber ohne dessen Schlüsseltypen. Schlüssel sind
 * relativ zum Namensraum `fahrtenbuch`.
 */
export type ExportTranslate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export interface ExportColumn {
  key: string;
  label: string;
  /** Breitenanteil in der Tabelle. */
  flex: number;
  align?: 'left' | 'right';
}

export interface ExportRow {
  cells: string[];
  /** Für die Hervorhebung im PDF — ein Defekt ist sicherheitsrelevant. */
  defekt?: boolean;
}

export interface ExportSection {
  vehicleId: string;
  /** „RLFA 2000 (FW-100ND)" */
  heading: string;
  columns: ExportColumn[];
  rows: ExportRow[];
  /** Gesetzt, wenn das Fahrzeug im Zeitraum keine Fahrt hat. */
  emptyText?: string;
  /**
   * Dieser Abschnitt enthält geschätzte Werte. Die Legende steht nur unter
   * diesen Tabellen — unter einer Tabelle ohne „ca."-Wert erklärt sie nichts
   * und sät nur Zweifel an abgelesenen Zahlen.
   */
  hasEstimates?: boolean;
}

export interface FahrtenbuchExportModel {
  title: string;
  period: string;
  sections: ExportSection[];
  /** Erklärung der „ca."-Werte; nur gesetzt, wenn welche vorkommen. */
  legend?: string;
  footer?: string;
}

export interface BuildFahrtenbuchExportOptions {
  /** Die gewählten Fahrzeuge in der Reihenfolge der Ausgabe. */
  vehicles: FahrtenbuchVehicle[];
  /** Alle Fahrten des Zeitraums, Reihenfolge beliebig. */
  entries: FahrtenbuchEntry[];
  /** Erster Tag des Zeitraums, `YYYY-MM-DD`. */
  from: string;
  /** Letzter Tag des Zeitraums, `YYYY-MM-DD`. */
  to: string;
  /** IANA-Zone des Benutzers; ohne Angabe UTC. */
  timeZone?: string;
  groupName?: string;
  /** ISO-Zeitstempel der Erstellung. */
  generatedAt?: string;
  generatedBy?: string;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Verschiebung der Zone gegenüber UTC zu einem Zeitpunkt, in Millisekunden.
 * `0` bei unbekannter Zone — ein Export soll an einer exotischen
 * Browsereinstellung nicht scheitern.
 */
function zoneOffsetMs(instant: number, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(instant));
    const value = (type: string) =>
      Number(parts.find((p) => p.type === type)?.value);
    const asUtc = Date.UTC(
      value('year'),
      value('month') - 1,
      value('day'),
      // Manche Umgebungen liefern für Mitternacht „24" statt „00".
      value('hour') % 24,
      value('minute'),
      value('second'),
    );
    return asUtc - Math.floor(instant / 1000) * 1000;
  } catch {
    return 0;
  }
}

/**
 * Ein Kalendertag in der Zone als UTC-Zeitpunkt. Zweistufig, weil der Offset
 * selbst vom Zeitpunkt abhängt: Der erste Durchgang schätzt ihn an der
 * UTC-Mitternacht, der zweite an der so gefundenen Ortszeit. Ohne den zweiten
 * Schritt läge die Grenze an einem Zeitumstellungstag um eine Stunde daneben.
 */
function zonedInstant(day: string, endOfDay: boolean, timeZone: string): string {
  const naive = Date.parse(
    `${day}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`,
  );
  const first = naive - zoneOffsetMs(naive, timeZone);
  const exact = naive - zoneOffsetMs(first, timeZone);
  return new Date(exact).toISOString();
}

/**
 * Die Abfragegrenzen eines Zeitraums: von der ersten Sekunde des `from`-Tags
 * bis zur letzten Millisekunde des `to`-Tags, jeweils in der Zone des
 * Benutzers. Ohne Zonenrechnung fehlten einem Wiener Benutzer im Sommer die
 * Fahrten zwischen 00:00 und 02:00 des ersten Tags.
 */
export function zonedDayRange(
  from: string,
  to: string,
  timeZone = 'UTC',
): { fromIso: string; toIso: string } {
  return {
    fromIso: zonedInstant(from, false, timeZone),
    toIso: zonedInstant(to, true, timeZone),
  };
}

/** `2025-06-01` → `01.06.2025`, ohne Zeitzonenrechnung. */
export function formatDayLabel(day: string): string {
  if (!DAY_RE.test(day)) return day;
  const [year, month, date] = day.split('-');
  return `${date}.${month}.${year}`;
}

/** Dateiname des Exports; Sonderzeichen werden zu Unterstrichen. */
export function exportFileName(
  from: string,
  to: string,
  groupName?: string,
): string {
  const group = (groupName ?? '')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '');
  return ['Fahrtenbuch', group, from, to].filter(Boolean).join('_') + '.pdf';
}

function dateTimeFormat(
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('de-AT', { timeZone, ...options });
  } catch {
    return new Intl.DateTimeFormat('de-AT', { timeZone: 'UTC', ...options });
  }
}

function formatDate(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return dateTimeFormat(timeZone, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function formatTime(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return dateTimeFormat(timeZone, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * „08:45 - 10:00", bei einer Fahrt über Mitternacht „23:50 - 09.06. 01:30".
 * Ohne den Tag an der Ankunft läse sich eine Nachtfahrt wie eine Zeitreise.
 */
function formatTimeRange(entry: FahrtenbuchEntry, timeZone: string): string {
  const departure = formatTime(entry.abfahrt, timeZone);
  const arrival = formatTime(entry.ankunft, timeZone);
  if (!departure && !arrival) return '';
  if (!arrival) return departure;
  const sameDay =
    formatDate(entry.abfahrt, timeZone) === formatDate(entry.ankunft, timeZone);
  if (sameDay) return `${departure} - ${arrival}`;
  const arrivalDay = formatDate(entry.ankunft, timeZone).slice(0, 6);
  return `${departure} - ${arrivalDay} ${arrival}`;
}

/**
 * Zahl für die Tabelle: ganzzahlig ohne Trenner, sonst mit Dezimalkomma.
 *
 * Bewusst ohne Tausenderpunkt — genau diese Schreibweise liest der PDF-Import
 * (`fahrtenbuchPdfImport.ts`) wieder als Kilometerstand ein. Ein „14.646"
 * wäre für ihn ein Lesefehler.
 */
export function formatCounterValue(value: number): string {
  if (!Number.isFinite(value)) return '';
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace('.', ',');
}

function counterLabel(def: CounterDefinition, t: ExportTranslate): string {
  return def.labelKey ? t(def.labelKey) : def.label;
}

/** Die Differenz aus Start und Ende, sonst der mitgeführte Wert. */
function readingDiff(reading: CounterReading): number | undefined {
  const { start, end, diff } = reading;
  if (start !== undefined && end !== undefined) return end - start;
  return diff;
}

interface CounterColumnSpec {
  def: CounterDefinition;
  /** `start`, `end` oder `diff` */
  part: 'start' | 'end' | 'diff';
}

/**
 * Die Zählerdefinitionen eines Fahrzeugs, ergänzt um Zähler, die nur in den
 * Fahrten stehen. Ein Fahrtenbuch ist ein Nachweisdokument — ein erfasster
 * Wert darf nicht verschwinden, weil die Zähler-Vorlage des Fahrzeugs
 * inzwischen gewechselt wurde.
 */
function counterDefinitions(
  vehicle: FahrtenbuchVehicle,
  entries: FahrtenbuchEntry[],
): CounterDefinition[] {
  const definitions = [...(vehicle.counters ?? [])];
  const known = new Set(definitions.map((d) => d.id));
  for (const entry of entries) {
    for (const [id, reading] of Object.entries(entry.counters ?? {})) {
      if (known.has(id) || !reading) continue;
      known.add(id);
      definitions.push({
        id,
        label: id,
        unit: '',
        // Ohne Definition entscheidet der Wert: ein Startstand macht daraus
        // einen Start/Ende-Zähler, sonst bleibt es eine Ablesung.
        mode: reading.start !== undefined ? 'startEnd' : 'reading',
        changeWarning: 'none',
        required: false,
      });
    }
  }
  return definitions;
}

/**
 * Spalten für die Zähler. Ein einzelner Start/Ende-Zähler trägt die Einheit im
 * Kopf („Start km" wie im Vorbild); bei mehreren muss der Name mit hinein,
 * sonst stünden bei einem Boot zwei Spalten „Start h" nebeneinander.
 */
function counterColumns(
  definitions: CounterDefinition[],
  t: ExportTranslate,
): { columns: ExportColumn[]; specs: CounterColumnSpec[] } {
  const startEndCount = definitions.filter((d) => d.mode === 'startEnd').length;
  const columns: ExportColumn[] = [];
  const specs: CounterColumnSpec[] = [];

  for (const def of definitions) {
    const label = counterLabel(def, t);
    const parts: CounterColumnSpec['part'][] =
      def.mode === 'startEnd' ? ['start', 'end', 'diff'] : ['end'];
    for (const part of parts) {
      const suffix = part.charAt(0).toUpperCase() + part.slice(1);
      let columnLabel: string;
      if (def.mode === 'reading') {
        columnLabel = t('export.columns.counterReading', {
          label,
          unit: def.unit,
        });
      } else if (startEndCount > 1) {
        columnLabel = t(`export.columns.counter${suffix}Labeled`, { label });
      } else {
        columnLabel = t(`export.columns.counter${suffix}`, { unit: def.unit });
      }
      columns.push({
        key: `counter:${def.id}:${part}`,
        label: columnLabel,
        flex: 1.1,
        align: 'right',
      });
      specs.push({ def, part });
    }
  }

  return { columns, specs };
}

/**
 * Betriebsmittel des Fahrzeugs, ergänzt um Arten, die nur in den Fahrten
 * vorkommen — dieselbe Begründung wie bei den Zählern.
 */
function fuelColumnTypes(
  vehicle: FahrtenbuchVehicle,
  entries: FahrtenbuchEntry[],
): FuelType[] {
  const used = new Set<FuelType>(vehicle.fuelTypes ?? []);
  for (const entry of entries) {
    for (const fuel of FUEL_TYPES) {
      const amount = entry.betriebsmittel?.[fuel];
      if (typeof amount === 'number' && Number.isFinite(amount) && amount > 0) {
        used.add(fuel);
      }
    }
  }
  return FUEL_TYPES.filter((f) => used.has(f));
}

function counterCell(
  entry: FahrtenbuchEntry,
  spec: CounterColumnSpec,
  t: ExportTranslate,
): { text: string; estimated: boolean } {
  const reading = entry.counters?.[spec.def.id];
  if (!reading) return { text: '', estimated: false };
  const value =
    spec.part === 'diff' ? readingDiff(reading) : reading[spec.part];
  if (value === undefined) return { text: '', estimated: false };
  const text = formatCounterValue(value);
  // Nur abgeleitete Endstände (und die daraus folgende Differenz) sind
  // gekennzeichnet — ein abgelesener Startstand ist ein abgelesener Wert.
  const estimated =
    spec.part !== 'start' &&
    entry.counterSources?.[spec.def.id] === 'estimate';
  return {
    text: estimated ? t('export.estimatePrefix', { value: text }) : text,
    estimated,
  };
}

export function buildFahrtenbuchExport(
  options: BuildFahrtenbuchExportOptions,
  t: ExportTranslate,
): FahrtenbuchExportModel {
  const {
    vehicles,
    entries,
    from,
    to,
    timeZone = 'UTC',
    groupName,
    generatedAt,
    generatedBy,
  } = options;

  let anyEstimate = false;

  const sections = vehicles.map<ExportSection>((vehicle) => {
    let sectionEstimate = false;
    const vehicleEntries = entries
      .filter((e) => !e.deleted && e.vehicleId === vehicle.id)
      .sort((a, b) => a.abfahrt.localeCompare(b.abfahrt));

    const definitions = counterDefinitions(vehicle, vehicleEntries);
    const { columns: counterCols, specs } = counterColumns(definitions, t);
    const fuels = fuelColumnTypes(vehicle, vehicleEntries);

    const columns: ExportColumn[] = [
      { key: 'datum', label: t('export.columns.datum'), flex: 1.2 },
      { key: 'zeit', label: t('export.columns.zeit'), flex: 1.5 },
      { key: 'fahrer', label: t('export.columns.fahrer'), flex: 2.2 },
      { key: 'grund', label: t('export.columns.grund'), flex: 1.4 },
      { key: 'ziel', label: t('export.columns.ziel'), flex: 3.4 },
      ...counterCols,
      ...fuels.map<ExportColumn>((fuel) => ({
        key: `fuel:${fuel}`,
        label: t('export.columns.fuel', {
          label: t(`fuel.${fuel}`),
          unit: t('fuelUnit'),
        }),
        flex: 1.1,
        align: 'right',
      })),
      { key: 'notizen', label: t('export.columns.notizen'), flex: 2.4 },
    ];

    const rows = vehicleEntries.map<ExportRow>((entry) => {
      const counterCells = specs.map((spec) => {
        const cell = counterCell(entry, spec, t);
        if (cell.estimated) {
          anyEstimate = true;
          sectionEstimate = true;
        }
        return cell.text;
      });

      const notes = [
        entry.hinweise?.trim(),
        entry.defekt ? t('defectReported') : undefined,
      ].filter(Boolean);

      return {
        cells: [
          formatDate(entry.abfahrt, timeZone),
          formatTimeRange(entry, timeZone),
          entry.driverName ?? '',
          t(`zwecke.${entry.zweck}`),
          entry.ziel?.trim() || entry.firecallName || '',
          ...counterCells,
          ...fuels.map((fuel) => {
            const amount = entry.betriebsmittel?.[fuel];
            return typeof amount === 'number' && amount > 0
              ? formatCounterValue(amount)
              : '';
          }),
          notes.join(' — '),
        ],
        defekt: entry.defekt,
      };
    });

    return {
      vehicleId: vehicle.id as string,
      heading: vehicle.kennzeichen
        ? `${vehicle.name} (${vehicle.kennzeichen})`
        : vehicle.name,
      columns,
      rows,
      // Ein gewähltes Fahrzeug ohne Fahrten wird ausgewiesen und nicht
      // weggelassen: „keine Fahrten" ist eine Aussage, ein fehlender Abschnitt
      // sieht wie ein vergessenes Fahrzeug aus.
      ...(rows.length === 0
        ? { emptyText: t('export.noEntriesInPeriod') }
        : {}),
      ...(sectionEstimate ? { hasEstimates: true } : {}),
    };
  });

  const generatedLabel = generatedAt
    ? `${formatDate(generatedAt, timeZone)} ${formatTime(generatedAt, timeZone)}`
    : undefined;

  return {
    title: groupName
      ? t('export.documentTitleGroup', { group: groupName })
      : t('export.documentTitle'),
    period: t('export.period', {
      from: formatDayLabel(from),
      to: formatDayLabel(to),
    }),
    sections,
    ...(anyEstimate ? { legend: t('export.estimateLegend') } : {}),
    ...(generatedLabel
      ? {
          footer: generatedBy
            ? t('export.generatedBy', {
                date: generatedLabel,
                user: generatedBy,
              })
            : t('export.generated', { date: generatedLabel }),
        }
      : {}),
  };
}
