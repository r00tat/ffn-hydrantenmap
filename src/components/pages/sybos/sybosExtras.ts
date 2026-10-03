/**
 * Weitere Abschnitte der Sybos-Seite: Atemschutz, Messungen, Spektren,
 * Fahrten und Anhänge.
 *
 * Getrennt von `sybosReport.ts`, weil diese Daten nicht aus dem
 * Einsatz-Kontext kommen, sondern aus eigenen Sammlungen — Trupps, Fahrtenbuch,
 * Ebenen mit Datenfeldern. Wie dort sind die Werte deutscher Text, so wie er in
 * Sybos eingetragen wird. Siehe docs/sybos-uebertrag.md.
 */
import { displayFileName } from '../../../common/attachmentName';
import { truppLabel, type AtemschutzTrupp } from '../../../common/atemschutz';
import { driverNamesOf, type FahrtenbuchEntry } from '../../../common/fahrtenbuch';
import { parseTimestamp } from '../../../common/time-format';
import type {
  DataSchemaField,
  Firecall,
  FirecallItem,
  FirecallLayer,
  Spectrum,
} from '../../firebase/firestore';
import { compareAlphabetically, formatDauer, formatSybosTime } from './sybosReport';

const numberFormat = new Intl.NumberFormat('de-AT', {
  maximumFractionDigits: 4,
  useGrouping: false,
});

function formatNumber(n: number): string {
  return numberFormat.format(n);
}

function sortKey(timestamp?: string): number {
  return parseTimestamp(timestamp)?.valueOf() ?? Number.MAX_SAFE_INTEGER;
}

// ---- Atemschutz ----

export interface TruppRow {
  trupp: string;
  mitglieder: string;
  personen: number;
  einheit: string;
  auftrag: string;
  abmarsch: string;
  rueckkehr: string;
  dauer: string;
  druck: string;
}

function druckText(abmarsch?: number, rueckkehr?: number): string {
  if (abmarsch == null && rueckkehr == null) return '';
  if (abmarsch != null && rueckkehr != null) {
    return `${abmarsch} → ${rueckkehr} bar`;
  }
  return `${abmarsch ?? rueckkehr} bar`;
}

/**
 * Eine Zeile je Bereitstellung, alphabetisch nach Trupp.
 *
 * Eine zweite Bereitstellung desselben Trupps bekommt ihre Nummer angehängt:
 * In Sybos ist das ein zweiter Atemschutzeinsatz, und zwei gleich benannte
 * Zeilen ließen nicht erkennen, welche schon übertragen ist.
 */
export function buildTruppRows(trupps: AtemschutzTrupp[]): TruppRow[] {
  return [...trupps]
    .sort(
      (a, b) =>
        compareAlphabetically(truppLabel(a), truppLabel(b)) ||
        (a.laufendeNummer ?? 0) - (b.laufendeNummer ?? 0),
    )
    .map((t) => {
      const label = truppLabel(t) || t.truppKey;
      const mitglieder = (t.mitglieder ?? []).filter(Boolean);
      return {
        trupp: (t.laufendeNummer ?? 1) > 1 ? `${label} (${t.laufendeNummer}.)` : label,
        mitglieder: mitglieder.join(', '),
        personen: mitglieder.length,
        einheit: t.entsendetAn || '',
        auftrag: [t.auftrag, t.einsatzziel].filter(Boolean).join(' – '),
        abmarsch: formatSybosTime(t.abmarschZeit),
        rueckkehr: formatSybosTime(t.rueckkehrZeit),
        dauer: formatDauer(t.abmarschZeit, t.rueckkehrZeit),
        druck: druckText(t.druckAbmarsch, t.druckRueckkehr),
      };
    });
}

/**
 * Die Atemschutzeinsätze als Text, **ohne** Namen der Geräteträger — der Text
 * geht auch an das Sprachmodell. Bereitstellungen ohne Abmarsch fehlen: Ein
 * Trupp, der nur bereitstand, war nicht unter Atemschutz.
 */
export function buildAtemschutzText(rows: TruppRow[]): string {
  return rows
    .filter((r) => r.abmarsch)
    .map((r) => {
      const head = r.personen > 0 ? `${r.trupp} (${r.personen} Personen)` : r.trupp;
      const details = [
        r.auftrag,
        `Abmarsch ${r.abmarsch}`,
        r.rueckkehr ? `Rückkehr ${r.rueckkehr}` : '',
        r.dauer,
        r.druck,
      ].filter(Boolean);
      return `${head} – ${details.join(', ')}`;
    })
    .join('\n');
}

// ---- Messungen an Ebenen mit Datenfeldern ----

export interface MeasurementColumn {
  key: string;
  header: string;
  numeric: boolean;
}

export interface MeasurementRow {
  name: string;
  time: string;
  values: string[];
  /** Zahlenwerte je Spalte für die Zusammenfassung; `undefined` wo leer. */
  numbers: (number | undefined)[];
}

export interface MeasurementTable {
  layerId: string;
  layerName: string;
  columns: MeasurementColumn[];
  rows: MeasurementRow[];
}

function columnHeader(field: DataSchemaField): string {
  return field.unit ? `${field.label} (${field.unit})` : field.label;
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'boolean') return value ? 'ja' : 'nein';
  if (typeof value === 'number') return formatNumber(value);
  return String(value);
}

/**
 * Je Ebene mit Datenfeldern eine Tabelle ihrer Messpunkte, nach Zeit sortiert.
 *
 * Berechnete Felder stehen nicht am Element, sondern werden beim Anzeigen aus
 * der Formel gerechnet (`computeAllFields`, asynchron wegen mathjs) — sie
 * kommen deshalb fertig als `computed` je Element-ID herein.
 */
export function buildMeasurementTables(
  items: FirecallItem[],
  layers: FirecallLayer[],
  computed: Record<string, Record<string, number>>,
): MeasurementTable[] {
  return layers
    .filter((l) => l.id && (l.dataSchema?.length ?? 0) > 0)
    .map((layer) => {
      const schema = layer.dataSchema ?? [];
      const columns = schema.map((f) => ({
        key: f.key,
        header: columnHeader(f),
        numeric: f.type === 'number' || f.type === 'computed',
      }));
      const rows = items
        .filter((i) => i.layer === layer.id && i.fieldData && Object.keys(i.fieldData).length > 0)
        .sort((a, b) => sortKey(a.datum) - sortKey(b.datum))
        .map((item) => {
          const raw = schema.map((f) =>
            f.type === 'computed' ? computed[item.id ?? '']?.[f.key] : item.fieldData?.[f.key],
          );
          return {
            name: item.name || '',
            time: formatSybosTime(item.datum),
            values: raw.map(formatValue),
            numbers: raw.map((v) => (typeof v === 'number' ? v : undefined)),
          };
        });
      return {
        layerId: layer.id!,
        layerName: layer.name || '',
        columns,
        rows,
      };
    })
    .filter((t) => t.rows.length > 0)
    .sort((a, b) => compareAlphabetically(a.layerName, b.layerName));
}

/** Kurzfassung einer Messreihe: Anzahl der Punkte und Spanne je Zahlenfeld. */
export function measurementSummary(table: MeasurementTable): string {
  const ranges = table.columns
    .map((col, i) => {
      if (!col.numeric) return '';
      const values = table.rows
        .map((r) => r.numbers[i])
        .filter((v): v is number => v !== undefined);
      if (values.length === 0) return '';
      const min = Math.min(...values);
      const max = Math.max(...values);
      return min === max
        ? `${col.header} ${formatNumber(min)}`
        : `${col.header} ${formatNumber(min)}–${formatNumber(max)}`;
    })
    .filter(Boolean);
  const count = table.rows.length === 1 ? '1 Messpunkt' : `${table.rows.length} Messpunkte`;
  return [`${table.layerName}: ${count}`, ...ranges].join('; ');
}

function csvCell(value: string): string {
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Die Messreihe als CSV zum Hochladen in Sybos — Semikolon und Dezimalkomma,
 * wie es Excel mit deutscher Einstellung öffnet.
 */
export function measurementCsv(table: MeasurementTable): string {
  const lines = [
    ['Messpunkt', 'Zeit', ...table.columns.map((c) => c.header)],
    ...table.rows.map((r) => [r.name, r.time, ...r.values]),
  ];
  return lines.map((line) => line.map(csvCell).join(';')).join('\r\n');
}

// ---- Spektren ----

export interface SpectrumRow {
  probe: string;
  geraet: string;
  nuklid: string;
  beginn: string;
  dauer: string;
  beschreibung: string;
}

export function buildSpectrumRows(items: FirecallItem[]): SpectrumRow[] {
  return (items.filter((i) => i.type === 'spectrum') as Spectrum[])
    .sort((a, b) => sortKey(a.startTime) - sortKey(b.startTime))
    .map((s) => ({
      probe: s.sampleName || s.name || '',
      geraet: s.deviceName || '',
      nuklid:
        s.manualNuclide ||
        (s.matchedNuclide
          ? s.matchedConfidence != null
            ? `${s.matchedNuclide} (${Math.round(s.matchedConfidence * 100)} %)`
            : s.matchedNuclide
          : ''),
      beginn: formatSybosTime(s.startTime),
      dauer: formatDauer(s.startTime, s.endTime),
      beschreibung: s.description || s.beschreibung || '',
    }));
}

/** Spektren als Text für Kopie und Sprachmodell. */
export function buildSpectrumText(rows: SpectrumRow[]): string {
  return rows
    .map((r) =>
      [r.probe, [r.nuklid, r.geraet, r.beginn, r.dauer].filter(Boolean).join(', '), r.beschreibung]
        .filter(Boolean)
        .join(' – '),
    )
    .join('\n');
}

// ---- Fahrten ----

export interface FahrtRow {
  fahrzeug: string;
  fahrer: string;
  abfahrt: string;
  ankunft: string;
  km: string;
  ziel: string;
}

export function buildFahrtenRows(entries: FahrtenbuchEntry[]): FahrtRow[] {
  return [...entries]
    .sort(
      (a, b) =>
        compareAlphabetically(a.vehicleName || '', b.vehicleName || '') ||
        sortKey(a.abfahrt) - sortKey(b.abfahrt),
    )
    .map((e) => {
      const km = e.counters?.km;
      const diff =
        km?.diff ?? (km?.start != null && km?.end != null ? km.end - km.start : undefined);
      return {
        fahrzeug: e.vehicleName || '',
        fahrer: driverNamesOf(e),
        abfahrt: formatSybosTime(e.abfahrt),
        ankunft: formatSybosTime(e.ankunft),
        km: diff != null ? formatNumber(diff) : '',
        ziel: e.ziel || '',
      };
    });
}

// ---- Anhänge ----

export interface AttachmentRef {
  /** Storage-URL (`gs://…` oder Download-URL). */
  url: string;
  name: string;
  /** Element, an dem der Anhang hängt; leer für den Einsatz selbst. */
  source: string;
}

function nameOf(url: string): string {
  const path = decodeURIComponent(url.split('?')[0]);
  return displayFileName(path.substring(path.lastIndexOf('/') + 1));
}

/**
 * Alle Anhänge im Storage — am Einsatz und an den Elementen.
 *
 * Eingebettete Anhänge (`FcAttachment` mit `data`) gibt es nur in einer
 * Einsatzsicherung; der Import lädt sie wieder hoch und schreibt die URL.
 */
export function collectAttachments(firecall: Firecall, items: FirecallItem[]): AttachmentRef[] {
  const result: AttachmentRef[] = (firecall.attachments ?? [])
    .filter((u): u is string => typeof u === 'string' && u !== '')
    .map((url) => ({ url, name: nameOf(url), source: '' }));
  for (const item of items) {
    const attachments = (item as { attachments?: unknown[] }).attachments;
    if (!Array.isArray(attachments)) continue;
    for (const a of attachments) {
      if (typeof a === 'string' && a !== '') {
        result.push({ url: a, name: nameOf(a), source: item.name || '' });
      }
    }
  }
  return result;
}
