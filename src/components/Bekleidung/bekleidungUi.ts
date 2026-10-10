/**
 * Reine Hilfen der Bekleidungsoberfläche: Daten bündeln, Stücke über die
 * Tag-Nummer finden, Zeitleiste und Personenansicht ableiten.
 *
 * Liegt neben den Komponenten und nicht in `common/`, weil nur die
 * Oberfläche sie braucht.
 */

import {
  normalizeTagNummer,
  type BekleidungArtikel,
  type BekleidungAusgabe,
  type BekleidungBestand,
  type BekleidungStueck,
  type BekleidungWaesche,
  type WaschProgramm,
} from '../../common/bekleidung';
import type { FahrtenbuchPerson } from '../../common/fahrtenbuch';

export interface BekleidungData {
  groupId: string;
  artikel: BekleidungArtikel[];
  stuecke: BekleidungStueck[];
  bestand: BekleidungBestand[];
  ausgaben: BekleidungAusgabe[];
  waeschen: BekleidungWaesche[];
  /** Alle Personen der Gruppe, auch inaktive. */
  persons: FahrtenbuchPerson[];
}

/** Die Daten samt Nachschlagetabellen — einmal je Render der Seite gebaut. */
export interface BekleidungView extends BekleidungData {
  artikelById: Map<string, BekleidungArtikel>;
  stueckById: Map<string, BekleidungStueck>;
  personById: Map<string, FahrtenbuchPerson>;
}

function byId<T extends { id?: string }>(list: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of list) if (item.id) map.set(item.id, item);
  return map;
}

export function buildBekleidungView(data: BekleidungData): BekleidungView {
  return {
    ...data,
    artikelById: byId(data.artikel),
    stueckById: byId(data.stuecke),
    personById: byId(data.persons),
  };
}

/** Heute im lokalen Kalender des Geräts als `YYYY-MM-DD`. */
export function todayLocalDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Ein Kalenderdatum als `Date` zum Formatieren. Mittag UTC, damit es in jeder
 * Zeitzone Europas auf denselben Tag fällt.
 */
export function isoDateToDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`);
}

/** Ganze Tage zwischen zwei Kalenderdaten. */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (isoDateToDate(to).getTime() - isoDateToDate(from).getTime()) / 86_400_000,
  );
}

/**
 * Stück zu einem gescannten oder getippten Code. Verglichen wird die
 * normalisierte Tag-Nummer — ein Handscanner liefert dieselbe Nummer wie das
 * Excel, gelegentlich mit Leerzeichen.
 */
export function findStueckByCode(
  stuecke: BekleidungStueck[],
  code: string,
): BekleidungStueck | undefined {
  const tag = normalizeTagNummer(code);
  if (!tag) return undefined;
  return stuecke.find((s) => s.tagNummer && normalizeTagNummer(s.tagNummer) === tag);
}

/** „Einsatzjacke · L · #22081702" */
export function stueckLabel(
  stueck: BekleidungStueck,
  artikelById: Map<string, BekleidungArtikel>,
): string {
  const artikel = artikelById.get(stueck.artikelId)?.bezeichnung ?? stueck.artikelId;
  return [artikel, stueck.groesse, stueck.tagNummer ? `#${stueck.tagNummer}` : undefined]
    .filter(Boolean)
    .join(' · ');
}

export type TimelineEntry =
  | {
      kind: 'ausgabe';
      key: string;
      date?: string;
      zurueckAm?: string;
      personId: string;
      bemerkung?: string;
    }
  | {
      kind: 'waesche';
      key: string;
      date: string;
      programm: WaschProgramm;
      programmText?: string;
    };

/** Ausgaben und Wäschen eines Stücks, neueste zuerst, ohne Datum am Ende. */
export function buildStueckTimeline(
  stueckId: string,
  ausgaben: BekleidungAusgabe[],
  waeschen: BekleidungWaesche[],
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  for (const a of ausgaben) {
    if (a.stueckId !== stueckId) continue;
    entries.push({
      kind: 'ausgabe',
      key: `a-${a.id}`,
      date: a.ausgegebenAm,
      zurueckAm: a.zurueckAm,
      personId: a.personId,
      bemerkung: a.bemerkung,
    });
  }
  for (const w of waeschen) {
    if (!w.stueckIds.includes(stueckId)) continue;
    entries.push({
      kind: 'waesche',
      key: `w-${w.id}`,
      date: w.datum,
      programm: w.programm,
      programmText: w.programmText,
    });
  }
  return entries.sort((x, y) => {
    if (!x.date && !y.date) return 0;
    if (!x.date) return 1;
    if (!y.date) return -1;
    return y.date.localeCompare(x.date);
  });
}

export interface PersonItems {
  /** Offene Ausgaben: Stücke und Mengen, die die Person gerade hat. */
  current: BekleidungAusgabe[];
  /** Geschlossene Ausgaben, zuletzt zurückgegebene zuerst. */
  history: BekleidungAusgabe[];
}

export function personItems(personId: string, ausgaben: BekleidungAusgabe[]): PersonItems {
  const own = ausgaben.filter((a) => a.personId === personId);
  const byIssued = (x: BekleidungAusgabe, y: BekleidungAusgabe) =>
    (y.ausgegebenAm ?? '').localeCompare(x.ausgegebenAm ?? '');
  return {
    current: own.filter((a) => !a.zurueckAm).sort(byIssued),
    history: own
      .filter((a) => !!a.zurueckAm)
      .sort((x, y) => (y.zurueckAm ?? '').localeCompare(x.zurueckAm ?? '') || byIssued(x, y)),
  };
}

/** Größen, die für einen Artikel schon vorkommen (Bestand und Stücke). */
export function knownSizes(
  artikelId: string,
  bestand: BekleidungBestand[],
  stuecke: BekleidungStueck[] = [],
): string[] {
  const sizes = new Set<string>();
  for (const b of bestand) if (b.artikelId === artikelId) sizes.add(b.groesse);
  for (const s of stuecke) if (s.artikelId === artikelId) sizes.add(s.groesse);
  return [...sizes].sort(new Intl.Collator('de', { numeric: true }).compare);
}
