/**
 * Das Datenmodell des Füllprotokoll-Ausdrucks — reine Funktionen, ohne
 * react-pdf, ohne Firestore und ohne next-intl.
 *
 * Dieselbe Aufteilung wie beim Fahrtenbuch (`fahrtenbuchExportModel.ts`) und
 * aus demselben Grund: Welche Angabe in welche Spalte gehört, ist die
 * eigentliche Logik des Ausdrucks und muss prüfbar bleiben, ohne ein PDF zu
 * rendern. Die Beschriftungen kommen über einen `translate`-Rückruf herein.
 *
 * Der Ausdruck ist ein **Nachweis**: Er nennt deshalb nicht nur die Zeilen,
 * sondern auch, welcher Ausschnitt gedruckt wurde. Ein Blatt, dem man nicht
 * ansieht, dass es nur die Übungen eines Monats zeigt, ist als Beleg wertlos.
 */

import {
  fuellungenGesamt,
  zweckOf,
  type AtemschutzFuellung,
  type FuellungZweck,
} from '../../common/atemschutz';
import { zonedParts } from '../../common/zonedDay';

/**
 * Wie `t` von next-intl, aber ohne dessen Schlüsseltypen. Schlüssel sind
 * relativ zum Namensraum `atemschutz`.
 */
export type FuellprotokollTranslate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export interface FuellprotokollColumn {
  key: string;
  label: string;
  /** Breitenanteil in der Tabelle, Summe 100. */
  width: number;
  align?: 'left' | 'right';
}

export interface FuellprotokollRow {
  cells: string[];
  /** Für die Hervorhebung im PDF — ein Mangel ist sicherheitsrelevant. */
  mangel?: boolean;
}

export interface FuellprotokollExportModel {
  title: string;
  /** „01.08.2026 – 31.08.2026" */
  period: string;
  /** Der gedruckte Ausschnitt, wenn er eingeschränkt war. */
  filter?: string;
  columns: FuellprotokollColumn[];
  rows: FuellprotokollRow[];
  /** „42 Flaschen gefüllt · davon 7 zu verrechnen" */
  summary: string;
  /** Gesetzt, wenn im Zeitraum nichts gefüllt wurde. */
  emptyText?: string;
  footer?: string;
}

export interface FuellprotokollExportInput {
  fuellungen: AtemschutzFuellung[];
  /** Kennung je `geraetId` aus den Stammdaten. */
  kennungById?: Map<string, string>;
  /** Tagesgrenzen als `YYYY-MM-DD`. */
  from: string;
  to: string;
  timeZone: string;
  groupName: string;
  /** Name des gewählten Einsatzes; `''` steht für *Ohne Einsatz*. */
  einsatzFilter?: string;
  zweckFilter?: FuellungZweck;
  nurVerrechnen?: boolean;
  generatedAt: string;
  generatedBy?: string;
}

const COLUMN_WIDTHS: Record<string, number> = {
  zeitpunkt: 14,
  flasche: 13,
  feuerwehr: 15,
  anzahl: 5,
  druck: 12,
  gefuelltVon: 15,
  fuellstation: 12,
  anlass: 14,
};

function formatTag(iso: string, timeZone: string): string {
  const p = zonedParts(iso, timeZone);
  if (!p) return '';
  const zwei = (n: number) => String(n).padStart(2, '0');
  return `${zwei(p.day)}.${zwei(p.month)}.${p.year}`;
}

function formatZeitpunkt(iso: string, timeZone: string): string {
  const p = zonedParts(iso, timeZone);
  if (!p) return '';
  const zwei = (n: number) => String(n).padStart(2, '0');
  // Datum und Uhrzeit in einer Zelle, durch einen Zeilenumbruch getrennt:
  // Nebeneinander bräuchte die Spalte ein Fünftel der Seite, und der Ausdruck
  // ist auf einer A4-Seite quer ohnehin eng.
  return `${zwei(p.day)}.${zwei(p.month)}.${p.year}\n${zwei(p.hour)}:${zwei(p.minute)}`;
}

/** `2026-08-01` → `01.08.2026`; unverändert, wenn es kein Tag ist. */
function formatTagAusIso(day: string): string {
  const teile = (day ?? '').split('-');
  if (teile.length !== 3) return day ?? '';
  return `${teile[2]}.${teile[1]}.${teile[0]}`;
}

function druckText(f: AtemschutzFuellung, t: FuellprotokollTranslate): string {
  return f.startdruck != null
    ? t('fuellung.druckRange', { start: f.startdruck, ende: f.enddruck })
    : t('fuellung.druckNurEnde', { ende: f.enddruck });
}

/**
 * Der Anlass in einer Spalte: der Einsatz, wenn es einen gibt, sonst der
 * Zweck.
 *
 * Zwei Spalten wären genauer und auf dem Papier trotzdem schlechter: Bei einer
 * Einsatzfüllung stünde in der Zweck-Spalte durchgehend „Einsatz", und der
 * Einsatzname ist die Angabe, die man auf dem Blatt sucht. Bei allem anderen
 * ist die Einsatzspalte leer — dort trägt der Zweck.
 */
function anlassText(f: AtemschutzFuellung, t: FuellprotokollTranslate): string {
  const zweck = t(`zweck.${zweckOf(f)}`);
  if (f.firecallName?.trim()) return f.firecallName.trim();
  return zweck;
}

/** Die Kennung der Flasche — aus den Stammdaten, sonst wie erfasst. */
function flaschenText(f: AtemschutzFuellung, kennungById?: Map<string, string>): string {
  const ausStammdaten = f.geraetId ? kennungById?.get(f.geraetId) : undefined;
  return ausStammdaten ?? f.flaschenNummer ?? '';
}

/**
 * Die Beschreibung des gedruckten Ausschnitts, oder `undefined`, wenn ohne
 * Einschränkung gedruckt wurde.
 */
export function filterText(
  input: Pick<FuellprotokollExportInput, 'einsatzFilter' | 'zweckFilter' | 'nurVerrechnen'>,
  t: FuellprotokollTranslate,
): string | undefined {
  const teile: string[] = [];
  if (input.einsatzFilter !== undefined) {
    teile.push(`${t('filter.einsatz')}: ${input.einsatzFilter || t('filter.ohneEinsatz')}`);
  }
  if (input.zweckFilter) {
    teile.push(`${t('fuellung.zweck')}: ${t(`zweck.${input.zweckFilter}`)}`);
  }
  if (input.nurVerrechnen) teile.push(t('verrechnen.nurZuVerrechnende'));
  return teile.length > 0 ? teile.join(' · ') : undefined;
}

export function buildFuellprotokollExport(
  input: FuellprotokollExportInput,
  t: FuellprotokollTranslate,
): FuellprotokollExportModel {
  const columns: FuellprotokollColumn[] = (
    [
      { key: 'zeitpunkt', label: t('fuellung.zeitpunkt') },
      { key: 'flasche', label: t('fuellung.flaschenNummer') },
      { key: 'feuerwehr', label: t('fuellung.feuerwehr') },
      { key: 'anzahl', label: t('fuellung.anzahl'), align: 'right' },
      { key: 'druck', label: t('export.druck'), align: 'right' },
      { key: 'gefuelltVon', label: t('fuellung.gefuelltVon') },
      { key: 'fuellstation', label: t('fuellung.fuellstation') },
      { key: 'anlass', label: t('export.anlass') },
    ] satisfies Omit<FuellprotokollColumn, 'width'>[]
  ).map((c) => ({ ...c, width: COLUMN_WIDTHS[c.key] ?? 10 }));

  // Aufsteigend und nicht wie in der Liste absteigend: Ein Nachweis wird von
  // vorn nach hinten gelesen, eine Bildschirmliste von oben.
  const sortiert = [...input.fuellungen].sort((a, b) =>
    (a.zeitpunkt ?? '').localeCompare(b.zeitpunkt ?? ''),
  );

  const rows: FuellprotokollRow[] = sortiert.map((f) => ({
    cells: [
      formatZeitpunkt(f.zeitpunkt, input.timeZone),
      flaschenText(f, input.kennungById),
      f.feuerwehr ?? '',
      String(f.anzahl ?? 1),
      druckText(f, t),
      f.gefuelltVon ?? '',
      f.fuellstationName ?? '',
      anlassText(f, t),
    ],
    ...(f.sichtkontrolle === 'mangel' ? { mangel: true } : {}),
  }));

  const gesamt = fuellungenGesamt(sortiert);
  const zuVerrechnen = fuellungenGesamt(sortiert.filter((f) => f.verrechnen));

  return {
    title: `${t('fuellprotokoll.title')} — ${input.groupName}`,
    period: `${formatTagAusIso(input.from)} – ${formatTagAusIso(input.to)}`,
    ...(filterText(input, t) ? { filter: filterText(input, t) } : {}),
    columns,
    rows,
    summary:
      zuVerrechnen > 0
        ? `${t('fuellung.total', { count: gesamt })} · ${t('verrechnen.summe', { count: zuVerrechnen })}`
        : t('fuellung.total', { count: gesamt }),
    ...(rows.length === 0 ? { emptyText: t('fuellung.empty') } : {}),
    // Zwei Schlüssel statt eines mit leerem `{user}`: „Erstellt am 02.09.2026
    // von " mit abgeschnittenem Namen sähe nach einem Fehler aus.
    footer: input.generatedBy
      ? t('export.generatedBy', {
          date: formatTag(input.generatedAt, input.timeZone),
          user: input.generatedBy,
        })
      : t('export.generated', {
          date: formatTag(input.generatedAt, input.timeZone),
        }),
  };
}

/**
 * Zerlegt das Modell in Teilmodelle mit je höchstens `rowsPerDocument` Zeilen.
 *
 * Warum überhaupt: `@react-pdf/renderer` hält das ausgelegte Dokument bis zum
 * Schluss im Speicher — beim Fahrtenbuch gemessene 0,3 bis 0,5 MB je Zeile
 * rissen einen Container mit 512 MiB (#665). Die Kopfangaben stehen nur im
 * ersten Teil, die Summe nur im letzten: Sonst stünde auf jeder hundertsten
 * Seite eine neue Überschrift und eine Zwischensumme, die keine ist.
 */
export function chunkFuellprotokollExport(
  model: FuellprotokollExportModel,
  rowsPerDocument: number,
): FuellprotokollExportModel[] {
  if (model.rows.length <= rowsPerDocument) return [model];

  const teile: FuellprotokollExportModel[] = [];
  for (let i = 0; i < model.rows.length; i += rowsPerDocument) {
    const erstes = i === 0;
    const letztes = i + rowsPerDocument >= model.rows.length;
    teile.push({
      ...model,
      title: erstes ? model.title : '',
      period: erstes ? model.period : '',
      ...(erstes ? {} : { filter: undefined }),
      rows: model.rows.slice(i, i + rowsPerDocument),
      summary: letztes ? model.summary : '',
      footer: letztes ? model.footer : undefined,
    });
  }
  return teile;
}
