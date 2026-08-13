/**
 * Der Zeitraum eines Wochenberichts — welche Tage, und mit welchen Grenzen
 * Firestore abgefragt wird.
 *
 * Eigenes Modul und rein: Die Wochenrechnung über einen Jahreswechsel und eine
 * Zeitumstellung ist der Teil, der schweigend falsch sein kann. Er muss ohne
 * Firestore und ohne Mailversand prüfbar sein.
 */

import {
  addDays,
  daysBetween,
  isoWeek,
  isoWeekMonday,
  parseIsoDay,
  zonedDayRange,
  zonedParts,
} from '../../common/zonedDay';

/**
 * Zone aller Tagesgrenzen des Berichts. Der Server läuft in UTC, gelesen wird
 * in Österreich — ohne feste Zone fehlten im Sommer die Fahrten zwischen 00:00
 * und 02:00 des ersten Tags. Dieselbe Vorgabe wie im PDF-Export und in
 * `buildMangelEmail`.
 */
export const REPORT_TIME_ZONE = 'Europe/Vienna';

/**
 * Höchstspanne eines Berichts in Tagen. Ein Riegel, kein fachliches Limit: Ein
 * Bericht über Jahre würde alle Fahrten der Gruppe in den Speicher und in eine
 * einzige Mail laden.
 */
export const REPORT_MAX_DAYS = 92;

export type ReportPeriodErrorKey =
  | 'conflictingPeriod'
  | 'invalidWeek'
  | 'invalidDay'
  | 'periodReversed'
  | 'periodTooLong';

/**
 * Lesbare Meldung je Schlüssel. Wie `ApiException` in `src/app/api/errors.ts`
 * eine Prosa-`message` neben dem maschinenlesbaren `status` führt, trennt auch
 * hier die Meldung vom Schlüssel: Wer nur `err.message` protokolliert oder
 * anzeigt — und das tut fast jeder Logger — soll einen Satz sehen und nicht
 * das Wort `periodTooLong`.
 */
const REPORT_PERIOD_MESSAGES: Record<ReportPeriodErrorKey, string> = {
  conflictingPeriod: 'Kalenderwoche und freier Zeitraum zugleich angegeben',
  invalidWeek: 'Keine gültige ISO-Kalenderwoche des angegebenen Jahres',
  invalidDay: 'Erster und letzter Tag müssen als YYYY-MM-DD angegeben sein',
  periodReversed: 'Der letzte Tag liegt vor dem ersten',
  periodTooLong: `Der Zeitraum überschreitet die Höchstspanne von ${REPORT_MAX_DAYS} Tagen`,
};

/**
 * Eine unbrauchbare Zeitraum-Angabe. Eigene Klasse, damit die Route sie von
 * einem Fehler beim Laden unterscheiden und mit 400 statt 500 antworten kann.
 *
 * Erzeugt wird sie über den Schlüssel, nicht über die Meldung: Der Schlüssel
 * ist der Vertrag, an dem der Aufrufer entscheidet, die Meldung nur Prosa.
 */
export class ReportPeriodError extends Error {
  readonly key: ReportPeriodErrorKey;

  constructor(key: ReportPeriodErrorKey) {
    super(REPORT_PERIOD_MESSAGES[key]);
    this.name = 'ReportPeriodError';
    this.key = key;
  }
}

export interface ReportPeriod {
  /** Erster Tag, `YYYY-MM-DD` */
  from: string;
  /** Letzter Tag, `YYYY-MM-DD` */
  to: string;
  /** ISO-Jahr des `from`-Tags */
  isoYear: number;
  /** ISO-Kalenderwoche des `from`-Tags — steht im Betreff */
  week: number;
  /** Untere Abfragegrenze in UTC */
  fromIso: string;
  /** Obere Abfragegrenze in UTC */
  toIso: string;
}

export interface ReportPeriodRequest {
  year?: number;
  week?: number;
  from?: string;
  to?: string;
}

function periodFromDays(from: string, to: string): ReportPeriod {
  const first = parseIsoDay(from);
  if (!first || !parseIsoDay(to)) throw new ReportPeriodError('invalidDay');
  // Zeichenweiser Vergleich genügt bei `YYYY-MM-DD` und ist vom Kalender
  // unabhängig.
  if (to < from) throw new ReportPeriodError('periodReversed');
  if (daysBetween(from, to) > REPORT_MAX_DAYS) {
    throw new ReportPeriodError('periodTooLong');
  }

  const { year: isoYear, week } = isoWeek(first.year, first.month, first.day);
  const { fromIso, toIso } = zonedDayRange(from, to, REPORT_TIME_ZONE);
  return { from, to, isoYear, week, fromIso, toIso };
}

function periodFromWeek(year?: number, week?: number): ReportPeriod {
  if (
    year === undefined ||
    week === undefined ||
    !Number.isInteger(year) ||
    !Number.isInteger(week) ||
    year < 2000 ||
    year > 2100 ||
    week < 1 ||
    week > 53
  ) {
    throw new ReportPeriodError('invalidWeek');
  }

  const from = isoWeekMonday(year, week);
  const parts = parseIsoDay(from);
  if (!parts) throw new ReportPeriodError('invalidWeek');

  // `isoWeekMonday` rechnet vom 4. Januar aus stur weiter. Eine Woche 53 in
  // einem Jahr, das keine hat, landet damit auf dem Montag der Woche 1 des
  // Folgejahres — für 2025 auf dem 29.12.2025, der zur KW1/2026 gehört. Das
  // ist nicht die angefragte Woche: abweisen statt stillschweigend verschieben.
  const check = isoWeek(parts.year, parts.month, parts.day);
  if (check.year !== year || check.week !== week) {
    throw new ReportPeriodError('invalidWeek');
  }

  return periodFromDays(from, addDays(from, 6));
}

/**
 * Der Zeitraum des Berichts.
 *
 * Ohne Angabe die letzte abgeschlossene ISO-Woche in `REPORT_TIME_ZONE` — der
 * Regelfall des Montagslaufs. `{ year, week }` und `{ from, to }` sind für das
 * Nachsenden und zum Prüfen da; beides zugleich ist ein Fehler und keine
 * stille Vorrangregel.
 */
export function resolveReportPeriod(
  request?: ReportPeriodRequest,
  now: Date = new Date(),
): ReportPeriod {
  const hasWeek = request?.year !== undefined || request?.week !== undefined;
  const hasDays = request?.from !== undefined || request?.to !== undefined;
  if (hasWeek && hasDays) throw new ReportPeriodError('conflictingPeriod');

  if (hasDays) {
    if (!request?.from || !request?.to) {
      throw new ReportPeriodError('invalidDay');
    }
    return periodFromDays(request.from, request.to);
  }

  if (hasWeek) return periodFromWeek(request?.year, request?.week);

  // Der Ortstag des Laufs, nicht der UTC-Tag: Ein Lauf am Montag um 00:30 Wien
  // ist in UTC noch Sonntag und würde sonst die Woche davor berichten.
  const today = zonedParts(now.toISOString(), REPORT_TIME_ZONE);
  if (!today) throw new ReportPeriodError('invalidDay');
  const current = isoWeek(today.year, today.month, today.day);
  const from = addDays(isoWeekMonday(current.year, current.week), -7);
  return periodFromDays(from, addDays(from, 6));
}
