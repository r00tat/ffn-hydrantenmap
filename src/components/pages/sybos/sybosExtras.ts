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
import {
  PA_SAETZE,
  truppLabel,
  type AtemschutzAusgabe,
  type AtemschutzGeraetTyp,
  type AtemschutzTrupp,
  type AusgabeStatus,
  type PaTypKey,
  type WarnungKey,
} from '../../../common/atemschutz';
import { sortierteAbfragen } from '../../../common/atemschutzUeberwachung';
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
function sortTrupps(trupps: AtemschutzTrupp[]): AtemschutzTrupp[] {
  return [...trupps].sort(
    (a, b) =>
      compareAlphabetically(truppLabel(a), truppLabel(b)) ||
      (a.laufendeNummer ?? 0) - (b.laufendeNummer ?? 0),
  );
}

export function buildTruppRows(trupps: AtemschutzTrupp[]): TruppRow[] {
  return sortTrupps(trupps).map((t) => {
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

// ---- Protokoll eines Trupps ----

export interface ProtokollKopf {
  label: string;
  value: string;
}

export interface ProtokollEreignis {
  zeit: string;
  ereignis: string;
  druck: string;
  bemerkung: string;
}

export interface TruppProtokoll {
  /** Dokument-ID der Bereitstellung, als React-Schlüssel. */
  id: string;
  titel: string;
  kopf: ProtokollKopf[];
  ereignisse: ProtokollEreignis[];
}

const PA_TYP_LABEL: Record<Exclude<PaTypKey, 'custom'>, string> = {
  standard200: 'Standard-PA',
  standard300: 'Standard-PA',
  langzeit300: 'Langzeit-PA',
};

const WARNUNG_LABEL: Record<WarnungKey, string> = {
  drittel: 'Warnung: 1/3 der Einsatzzeit',
  zweiDrittel: 'Warnung: 2/3 der Einsatzzeit',
  rueckzug: 'Warnung: Rückzugszeitpunkt',
};

function geraetesatzText(t: AtemschutzTrupp): string {
  if (t.paTyp && t.paTyp !== 'custom') {
    const satz = PA_SAETZE[t.paTyp];
    return `${PA_TYP_LABEL[t.paTyp]}, ${satz.flaschenAnzahl} × ${formatNumber(
      satz.flaschenVolumen,
    )} l / ${satz.fuellDruck} bar`;
  }
  if (!t.flaschenVolumen && !t.fuellDruck) return '';
  return [
    t.flaschenVolumen ? `${t.flaschenAnzahl ?? 1} × ${formatNumber(t.flaschenVolumen)} l` : '',
    t.fuellDruck ? `${t.fuellDruck} bar` : '',
  ]
    .filter(Boolean)
    .join(' / ');
}

function bar(druck?: number): string {
  return druck != null && Number.isFinite(druck) ? `${druck} bar` : '';
}

/**
 * Die ganze Dokumentation einer Bereitstellung: Kopfdaten und alle Ereignisse
 * in zeitlicher Folge — Bereitstellung, Übergabe, Übernahme der Zeitkontrolle,
 * Abmarsch, jede Druckabfrage und Statusmeldung, verschickte Warnungen,
 * Rückkehr.
 *
 * Ankunft und Rückzug werden wie auf der Überwachungsseite nur an der
 * **ersten** Meldung benannt: Ältere Zeilen tragen den Haken `amZiel` an
 * jeder Folgeabfrage, und dann stünde „Am Einsatzziel" mehrmals da.
 */
export function buildTruppProtokoll(t: AtemschutzTrupp): TruppProtokoll {
  const label = truppLabel(t) || t.truppKey;
  const kopf: ProtokollKopf[] = [
    { label: 'Mitglieder', value: (t.mitglieder ?? []).filter(Boolean).join(', ') },
    { label: 'Einheit', value: t.entsendetAn || '' },
    { label: 'Auftrag', value: t.auftrag || '' },
    { label: 'Einsatzziel', value: t.einsatzziel || '' },
    { label: 'Überwacht von', value: t.ueberwachtVon || '' },
    {
      label: 'Zeitkontrolle',
      value: t.ueberwachungSeit
        ? [formatSybosTime(t.ueberwachungSeit), formatSybosTime(t.ueberwachungBis)]
            .filter(Boolean)
            .join(' – ')
        : '',
    },
    { label: 'Gerätesatz', value: geraetesatzText(t) },
    { label: 'Bemerkung', value: t.bemerkung || '' },
  ].filter((k) => k.value !== '');

  const roh: (ProtokollEreignis & { ts?: string })[] = [];
  const add = (ts: string | undefined, ereignis: string, druck = '', bemerkung = '') => {
    if (ts) roh.push({ ts, zeit: formatSybosTime(ts), ereignis, druck, bemerkung });
  };

  add(t.bereitSeit, 'Bereitgestellt');
  add(t.uebergabeZeit, 'Übergabe an Einheit', bar(t.druckUebergabe));
  add(t.ueberwachungSeit, 'Zeitkontrolle übernommen', '', t.ueberwachtVon || '');
  add(t.abmarschZeit, 'Abmarsch', bar(t.druckAbmarsch));

  const abfragen = sortierteAbfragen(t);
  const ersteAnkunft = abfragen.find((a) => a.amZiel === true);
  const ersterRueckzug = abfragen.find((a) => a.rueckzug === true);
  for (const a of abfragen) {
    const ereignis =
      [a === ersteAnkunft ? 'Am Einsatzziel' : '', a === ersterRueckzug ? 'Rückzug angetreten' : '']
        .filter(Boolean)
        .join(', ') || (a.druck != null ? 'Druckabfrage' : 'Statusmeldung');
    add(a.zeitpunkt, ereignis, bar(a.druck), a.bemerkung || '');
  }

  for (const [key, ts] of Object.entries(t.warnungen ?? {})) {
    add(ts, WARNUNG_LABEL[key as WarnungKey] ?? `Warnung: ${key}`);
  }
  add(t.rueckkehrZeit, 'Rückkehr', bar(t.druckRueckkehr));
  add(t.ueberwachungBis, 'Zeitkontrolle beendet');

  // Stabil sortiert: Gleichzeitige Einträge behalten die Reihenfolge oben.
  const ereignisse = roh
    .map((e, i) => ({ e, i, ms: sortKey(e.ts) }))
    .sort((a, b) => a.ms - b.ms || a.i - b.i)
    .map(({ e }) => ({
      zeit: e.zeit,
      ereignis: e.ereignis,
      druck: e.druck,
      bemerkung: e.bemerkung,
    }));

  return {
    id: t.id ?? `${t.truppKey}-${t.laufendeNummer}`,
    titel: (t.laufendeNummer ?? 1) > 1 ? `${label} (${t.laufendeNummer}.)` : label,
    kopf,
    ereignisse,
  };
}

/** Die Protokolle aller Bereitstellungen, in der Reihenfolge der Tabelle. */
export function buildTruppProtokolle(trupps: AtemschutzTrupp[]): TruppProtokoll[] {
  return sortTrupps(trupps).map(buildTruppProtokoll);
}

export function truppProtokollText(p: TruppProtokoll): string {
  return [
    p.titel,
    ...p.kopf.map((k) => `${k.label}: ${k.value}`),
    ...p.ereignisse.map(
      (e) =>
        `${e.zeit} ${[e.ereignis, e.druck].filter(Boolean).join(', ')}` +
        (e.bemerkung ? ` – ${e.bemerkung}` : ''),
    ),
  ].join('\n');
}

// ---- Geräte ----

const GERAET_TYP_LABEL: Record<AtemschutzGeraetTyp, string> = {
  flasche: 'Atemluftflasche',
  maske: 'Atemmaske',
  pressluftatmer: 'Pressluftatmer',
  zubehoer: 'Zubehör',
  fuellstation: 'Füllstation',
};

export interface GeraetRow {
  trupp: string;
  person: string;
  typ: string;
  bezeichnung: string;
  kennung: string;
}

/**
 * Die am Trupp erfassten Geräte, eine Zeile je Gerät — so, wie sie in Sybos
 * je Geräteträger eingetragen werden. Sortiert nach Trupp und Träger; Geräte
 * ohne Träger stehen im Trupp zuerst.
 */
export function buildGeraeteRows(trupps: AtemschutzTrupp[]): GeraetRow[] {
  return sortTrupps(trupps).flatMap((t) => {
    const trupp = buildTruppProtokoll(t).titel;
    return [...(t.truppGeraete ?? [])]
      .map((g) => ({
        trupp,
        person: g.person?.trim() || '',
        typ: GERAET_TYP_LABEL[g.typ] ?? g.typ,
        bezeichnung: g.bezeichnung || '',
        kennung: g.kennung || '',
      }))
      .sort(
        (a, b) => compareAlphabetically(a.person, b.person) || compareAlphabetically(a.typ, b.typ),
      );
  });
}

const AUSGABE_STATUS_LABEL: Record<AusgabeStatus, string> = {
  amPlatz: 'Am Platz',
  ausgegeben: 'Ausgegeben',
  zurueck: 'Zurück',
};

export interface AusgabeRow {
  geraet: string;
  an: string;
  status: string;
  ausgabe: string;
  ruecknahme: string;
}

/** Ausgaben der Ausrüstung am Sammelplatz, alphabetisch nach Gerät. */
export function buildAusgabeRows(ausgaben: AtemschutzAusgabe[]): AusgabeRow[] {
  return [...ausgaben]
    .sort((a, b) => compareAlphabetically(a.geraetName || '', b.geraetName || ''))
    .map((a) => ({
      geraet: a.geraetName || '',
      an: a.ausgegebenAn || '',
      status: AUSGABE_STATUS_LABEL[a.status] ?? a.status,
      ausgabe: formatSybosTime(a.ausgabeZeit),
      ruecknahme: formatSybosTime(a.ruecknahmeZeit),
    }));
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

/**
 * Eine Zelle für die CSV. Namen von Messpunkten und Ebenen sind Freitext: Was
 * mit `=`, `+`, `-` oder `@` beginnt, führte Excel als Formel aus. Solche
 * Zellen bekommen ein `'` vorangestellt — außer echten Zahlen, damit negative
 * Messwerte Zahlen bleiben.
 */
function csvCell(value: string): string {
  const isNumber = value !== '' && !Number.isNaN(Number(value.replace(',', '.')));
  const v = !isNumber && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
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
