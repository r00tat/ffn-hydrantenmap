import { formatTimestamp, parseTimestamp } from '../../common/time-format';
import type { Firecall } from '../firebase/firestore';

export interface FirecallYearGroup {
  /** Jahr des Einsatzdatums, `undefined` für Einsätze ohne gültiges Datum. */
  year?: number;
  firecalls: Firecall[];
}

/**
 * Teilt die Einsätze nach dem Jahr ihres Datums auf, neuestes Jahr zuerst.
 * Innerhalb eines Jahres bleibt die Reihenfolge der Eingabe erhalten — die
 * Abfrage sortiert bereits nach Datum. Einsätze ohne lesbares Datum landen
 * in einer eigenen Gruppe am Ende, statt stillschweigend zu verschwinden.
 */
export function groupFirecallsByYear(firecalls: Firecall[]): FirecallYearGroup[] {
  const byYear = new Map<number, Firecall[]>();
  const withoutDate: Firecall[] = [];

  for (const firecall of firecalls) {
    const year = parseTimestamp(firecall.date)?.year();
    if (year === undefined) {
      withoutDate.push(firecall);
      continue;
    }
    const list = byYear.get(year);
    if (list) {
      list.push(firecall);
    } else {
      byYear.set(year, [firecall]);
    }
  }

  const groups: FirecallYearGroup[] = [...byYear.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, list]) => ({ year, firecalls: list }));
  if (withoutDate.length > 0) {
    groups.push({ year: undefined, firecalls: withoutDate });
  }
  return groups;
}

function searchText(firecall: Firecall): string {
  const parts = [firecall.name, firecall.fw, firecall.description];
  const date = parseTimestamp(firecall.date);
  if (date) {
    // Angezeigte Schreibweise und die ohne führende Nullen („7.3.2025"),
    // so wie man ein Datum eben eintippt.
    parts.push(formatTimestamp(date.toDate()), date.format('D.M.YYYY'));
  }
  return parts.filter(Boolean).join(' ').toLocaleLowerCase('de');
}

/**
 * Freitextsuche über Titel, Feuerwehr, Beschreibung und Datum. Jedes durch
 * Leerzeichen getrennte Suchwort muss vorkommen, Groß-/Kleinschreibung zählt
 * nicht.
 */
export function matchesFirecallSearch(firecall: Firecall, query: string): boolean {
  const terms = query.toLocaleLowerCase('de').split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return true;
  }
  const text = searchText(firecall);
  return terms.every((term) => text.includes(term));
}

export function filterFirecalls(firecalls: Firecall[], query: string): Firecall[] {
  if (query.trim() === '') {
    return firecalls;
  }
  return firecalls.filter((firecall) => matchesFirecallSearch(firecall, query));
}
