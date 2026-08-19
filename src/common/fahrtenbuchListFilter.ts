/**
 * Der Filter über der Fahrtenliste: Freitextsuche, Zeitraum, Fahrer, Fahrzeug,
 * Zweck und Defekte.
 *
 * Reine Funktionen ohne React, Firestore und next-intl — dieselbe Aufteilung
 * wie bei der Statistik (`fahrtenbuchStats.ts`), deren Filter dieselben
 * Bausteine benutzt (`driverKeyOf`, Ortstag aus `zonedParts`). Bewusst ein
 * eigenes Modul und nicht ein weiteres Feld an `StatsFilter`: Die Statistik
 * filtert über Mengen (mehrere Fahrzeuge, mehrere Zwecke) und kennt keine
 * Freitextsuche, die Liste filtert über eine einzelne Auswahl.
 */

import {
  FAHRT_ZWECKE,
  type FahrtZweck,
  type FahrtenbuchEntry,
} from './fahrtenbuch';
import { driverSharesOf } from './fahrtenbuchStats';
import { zonedDayRange, zonedParts } from './zonedDay';

export interface FahrtenbuchListFilter {
  /** Freitext; alle Wörter müssen vorkommen. */
  search: string;
  /** Erster Tag, `YYYY-MM-DD`; leer heißt „ohne untere Grenze". */
  from: string;
  /** Letzter Tag, `YYYY-MM-DD`; leer heißt „ohne obere Grenze". */
  to: string;
  /** Schlüssel aus `driverKeyOf`; leer heißt „alle Fahrer". */
  driverKey: string;
  /** Leer heißt „alle Fahrzeuge". */
  vehicleId: string;
  /** Leer heißt „alle Zwecke". */
  zweck: FahrtZweck | '';
  onlyDefects: boolean;
}

export const EMPTY_FAHRTENBUCH_LIST_FILTER: FahrtenbuchListFilter = {
  search: '',
  from: '',
  to: '',
  driverKey: '',
  vehicleId: '',
  zweck: '',
  onlyDefects: false,
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Die Query-Parameter, die dieser Filter belegt. Wer die URL neu schreibt,
 * räumt genau diese weg und lässt fremde Parameter der Seite stehen.
 */
export const FAHRTENBUCH_LIST_FILTER_PARAMS = [
  'q',
  'von',
  'bis',
  'fahrer',
  'fahrzeug',
  'zweck',
  'defekte',
] as const;

/**
 * Die Schreibweise, in der verglichen wird: klein, ohne diakritische Zeichen,
 * mit einfachen Leerzeichen.
 *
 * Umlaute werden aufgelöst und `ß` zu `ss` — wer „Hauptstrasse" tippt, sucht
 * die „Hauptstraße", und auf einer Handytastatur ist der Umlaut der
 * mühsamere Weg. Deshalb nicht `normalizeName` aus `fahrtenbuch.ts`: Das hält
 * die Umlaute, weil es Namen für einen Gleichheitsvergleich vereinheitlicht
 * und dabei nichts zusammenwerfen darf.
 */
export function normalizeSearch(value: string): string {
  return (value || '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Der durchsuchbare Text einer Fahrt.
 *
 * Neben Fahrstrecke, Einsatz und den beiden Textfeldern auch Fahrer samt
 * Zusatzfahrern und Fahrzeug: Das Suchfeld steht über einer Tabelle, in der beides als Spalte
 * sichtbar ist — eine Suche, die den dort gelesenen Namen nicht findet, wirkt
 * kaputt. `ziel` und `firecallName` stehen beide drin, weil die Spalte bei
 * einer Einsatzfahrt ohne Ziel den Einsatznamen zeigt.
 */
export function entrySearchText(entry: FahrtenbuchEntry): string {
  return normalizeSearch(
    [
      entry.ziel,
      entry.firecallName,
      entry.hinweise,
      entry.mangel,
      entry.driverName,
      // Wer nur mitgefahren ist, steht in der Fahrer-Spalte hinter „+1" und
      // muss über die Suche zu finden sein.
      ...(entry.coDrivers ?? []).map((ref) => ref.name),
      entry.vehicleName,
    ]
      .filter(Boolean)
      .join(' '),
  );
}

/** Der Ortstag einer Fahrt, `undefined` bei unlesbarem Zeitstempel. */
function entryDay(entry: FahrtenbuchEntry, timeZone: string) {
  return zonedParts(entry.abfahrt, timeZone)?.isoDay;
}

/**
 * Die Fahrten, die dem Filter entsprechen.
 *
 * Der Zeitraum wird über den *Ortstag* verglichen, nicht über den ISO-String:
 * Eine Fahrt um 00:30 Ortszeit steht in UTC am Vortag und fiele sonst aus dem
 * gewählten Bereich, obwohl die Liste sie an diesem Tag anzeigt.
 */
export function filterFahrtenbuchEntries(
  entries: FahrtenbuchEntry[],
  filter: FahrtenbuchListFilter,
  timeZone: string,
): FahrtenbuchEntry[] {
  const words = normalizeSearch(filter.search)
    .split(' ')
    .filter((word) => word.length > 0);

  return entries.filter((entry) => {
    if (filter.vehicleId && entry.vehicleId !== filter.vehicleId) return false;
    if (filter.zweck && entry.zweck !== filter.zweck) return false;
    if (filter.onlyDefects && !entry.defekt) return false;
    if (
      filter.driverKey &&
      !driverSharesOf(entry).some((s) => s.key === filter.driverKey)
    ) {
      return false;
    }
    if (filter.from || filter.to) {
      const day = entryDay(entry, timeZone);
      if (!day) return false;
      if (filter.from && day < filter.from) return false;
      if (filter.to && day > filter.to) return false;
    }
    if (words.length > 0) {
      const haystack = entrySearchText(entry);
      if (!words.every((word) => haystack.includes(word))) return false;
    }
    return true;
  });
}

/**
 * Die Grenzen für die Firestore-Abfrage.
 *
 * Der Zeitraum ist der einzige Filter, der die geladene Menge verändern muss:
 * Ohne ihn zeigt die Liste die jüngsten Fahrten, und alles Ältere wäre über
 * kein Suchfeld erreichbar. Die übrigen Filter rechnen im Browser über das
 * Geladene — Firestore kann weder Teilstrings noch mehrere Bereichsfelder.
 *
 * Eine offene Grenze bleibt `undefined`, damit die Abfrage sie nicht setzt.
 */
export function fahrtenbuchListFilterRange(
  filter: FahrtenbuchListFilter,
  timeZone: string,
): { fromIso?: string; toIso?: string } {
  return {
    fromIso: filter.from
      ? zonedDayRange(filter.from, filter.from, timeZone).fromIso
      : undefined,
    toIso: filter.to
      ? zonedDayRange(filter.to, filter.to, timeZone).toIso
      : undefined,
  };
}

export interface DriverOption {
  /** Schlüssel aus `driverKeyOf`. */
  key: string;
  /** Anzeigename — die erste Schreibweise, die vorkommt. */
  name: string;
}

/**
 * Die Fahrer der übergebenen Fahrten, jeder einmal und nach Namen sortiert.
 *
 * Die Auswahl entsteht aus den geladenen Fahrten und nicht aus den Stammdaten:
 * So stehen dort genau die Fahrer, die in dieser Liste vorkommen — keine
 * Auswahl, die auf ein leeres Ergebnis führt, und auch frei eingetippte Namen
 * sind auswählbar.
 */
export function driverOptionsOf(entries: FahrtenbuchEntry[]): DriverOption[] {
  const byKey = new Map<string, string>();
  for (const entry of entries) {
    // Ohne Fahrer (Anhänger) gibt es nichts auszuwählen; ein Zusatzfahrer ist
    // dagegen auswählbar, sonst fände er seine Fahrten nicht wieder.
    for (const driver of driverSharesOf(entry)) {
      if (!byKey.has(driver.key)) byKey.set(driver.key, driver.name);
    }
  }
  return [...byKey.entries()]
    .map(([key, name]) => ({ key, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function hasActiveFahrtenbuchListFilter(
  filter: FahrtenbuchListFilter,
): boolean {
  return (
    !!filter.search.trim() ||
    !!filter.from ||
    !!filter.to ||
    !!filter.driverKey ||
    !!filter.vehicleId ||
    !!filter.zweck ||
    filter.onlyDefects
  );
}

/**
 * Die Query-Parameter zu einem Filter — nur die gesetzten. Deutsche Namen wie
 * beim bestehenden `?vehicle=` der Mängelliste: Die URL wird geteilt und
 * gelesen.
 */
export function fahrtenbuchListFilterToParams(
  filter: FahrtenbuchListFilter,
): Record<string, string> {
  const params: Record<string, string> = {};
  const search = filter.search.trim();
  if (search) params.q = search;
  if (filter.from) params.von = filter.from;
  if (filter.to) params.bis = filter.to;
  if (filter.driverKey) params.fahrer = filter.driverKey;
  if (filter.vehicleId) params.fahrzeug = filter.vehicleId;
  if (filter.zweck) params.zweck = filter.zweck;
  if (filter.onlyDefects) params.defekte = '1';
  return params;
}

/** Ein `YYYY-MM-DD`, das es als Tag auch gibt; sonst leer. */
function parseDay(value: string | null): string {
  if (!value || !DAY_RE.test(value)) return '';
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? value
    : '';
}

/**
 * Der Filter aus den Query-Parametern.
 *
 * Unbrauchbare Werte fallen still weg statt zu einem leeren Ergebnis zu
 * führen: Die URL kommt aus fremder Hand — aus einem geteilten Link, einem
 * Lesezeichen oder von Hand getippt.
 */
export function parseFahrtenbuchListFilter(
  params: URLSearchParams,
): FahrtenbuchListFilter {
  const zweck = params.get('zweck') ?? '';
  return {
    search: params.get('q')?.trim() ?? '',
    from: parseDay(params.get('von')),
    to: parseDay(params.get('bis')),
    driverKey: params.get('fahrer')?.trim() ?? '',
    vehicleId: params.get('fahrzeug')?.trim() ?? '',
    zweck: FAHRT_ZWECKE.includes(zweck as FahrtZweck)
      ? (zweck as FahrtZweck)
      : '',
    onlyDefects: params.get('defekte') === '1',
  };
}
