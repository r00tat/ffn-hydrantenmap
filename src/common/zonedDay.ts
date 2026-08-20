/**
 * Kalenderrechnung in der Zeitzone des Benutzers.
 *
 * Stand vorher als private Helfer im PDF-Export des Fahrtenbuchs
 * (`fahrtenbuchExportModel.ts`). Die Statistik braucht dieselbe Rechnung —
 * ohne sie fällt eine Fahrt um 00:30 Ortszeit in den Vormonat und die
 * Monatssummen weichen von der Fahrtenliste ab. Ein Modul unter `src/common`
 * statt eines Imports quer durch `src/components`: Der Export liegt bei den
 * Komponenten, die Zeitzonenrechnung gehört keiner Oberfläche.
 */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Verschiebung der Zone gegenüber UTC zu einem Zeitpunkt, in Millisekunden.
 * `0` bei unbekannter Zone — eine Auswertung soll an einer exotischen
 * Browsereinstellung nicht scheitern.
 */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = zonedFormatParts(instant, timeZone);
  if (!parts) return 0;
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

interface FormatParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedFormatParts(
  instant: number,
  timeZone: string,
): FormatParts | undefined {
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
    return {
      year: value('year'),
      month: value('month'),
      day: value('day'),
      // Manche Umgebungen liefern für Mitternacht „24" statt „00".
      hour: value('hour') % 24,
      minute: value('minute'),
      second: value('second'),
    };
  } catch {
    return undefined;
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

export interface ZonedParts {
  year: number;
  month: number;
  /** Tag im Monat, 1–31 */
  day: number;
  hour: number;
  minute: number;
  /** ISO-Wochentag: Montag 1 … Sonntag 7 */
  weekday: number;
  /** Der Ortstag als `YYYY-MM-DD` */
  isoDay: string;
}

/** Die Kalenderteile eines Zeitpunkts in der Zone; `undefined` bei Unsinn. */
export function zonedParts(
  iso: string,
  timeZone: string,
): ZonedParts | undefined {
  const instant = Date.parse(iso);
  if (Number.isNaN(instant)) return undefined;
  const parts = zonedFormatParts(instant, timeZone) ?? {
    year: new Date(instant).getUTCFullYear(),
    month: new Date(instant).getUTCMonth() + 1,
    day: new Date(instant).getUTCDate(),
    hour: new Date(instant).getUTCHours(),
    minute: new Date(instant).getUTCMinutes(),
    second: 0,
  };
  if (!Number.isFinite(parts.year)) return undefined;
  const { year, month, day, hour, minute } = parts;
  // Der Wochentag über einen UTC-Zeitpunkt aus den Ortsteilen — so gilt er für
  // den Ortstag und nicht für den UTC-Tag.
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return {
    year,
    month,
    day,
    hour,
    minute,
    weekday: weekday === 0 ? 7 : weekday,
    isoDay: toIsoDay(year, month, day),
  };
}

/** `2025`, `3`, `14` → `2025-03-14` */
export function toIsoDay(year: number, month: number, day: number): string {
  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');
}

/** Zerlegt `2025-03-14`; `undefined`, wenn das keine Tagesangabe ist. */
export function parseIsoDay(
  day: string,
): { year: number; month: number; day: number } | undefined {
  if (!DAY_RE.test(day ?? '')) return undefined;
  // Einzeln statt `.map(Number)`: Ein Indexzugriff auf das Array ist für den
  // Compiler `number | undefined`, obwohl DAY_RE die drei Teile garantiert.
  const [yearPart, monthPart, datePart] = day.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);
  const date = Number(datePart);
  const asUtc = Date.UTC(year, month - 1, date);
  const check = new Date(asUtc);
  // `2025-02-30` wäre sonst der 2. März — eine stille Verschiebung.
  if (check.getUTCMonth() + 1 !== month || check.getUTCDate() !== date) {
    return undefined;
  }
  return { year, month, day: date };
}

/**
 * ISO-8601-Kalenderwoche. Der 4. Januar liegt immer in Woche 1, und die Woche
 * beginnt am Montag; daraus folgt, dass der 1. Januar zur letzten Woche des
 * Vorjahres gehören kann und der 30. Dezember zur ersten des Folgejahres.
 */
export function isoWeek(
  year: number,
  month: number,
  day: number,
): { year: number; week: number } {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  // Auf den Donnerstag derselben Woche — dessen Jahr ist das ISO-Jahr.
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstWeekday = firstThursday.getUTCDay() || 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 4 - firstWeekday);
  const week =
    1 +
    Math.round(
      (date.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000),
    );
  return { year: isoYear, week };
}

/** Der Montag einer ISO-Kalenderwoche als `YYYY-MM-DD`. */
export function isoWeekMonday(isoYear: number, week: number): string {
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const weekday = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (weekday - 1) + (week - 1) * 7);
  return toIsoDay(
    monday.getUTCFullYear(),
    monday.getUTCMonth() + 1,
    monday.getUTCDate(),
  );
}

/** `2025-03-14` plus `days` Tage, wieder als `YYYY-MM-DD`. */
export function addDays(day: string, days: number): string {
  const parts = parseIsoDay(day);
  if (!parts) return day;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDay(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

/** Zahl der Tage von `from` bis `to`, beide eingeschlossen; `0` bei Unsinn. */
export function daysBetween(from: string, to: string): number {
  const a = parseIsoDay(from);
  const b = parseIsoDay(to);
  if (!a || !b) return 0;
  const start = Date.UTC(a.year, a.month - 1, a.day);
  const end = Date.UTC(b.year, b.month - 1, b.day);
  if (end < start) return 0;
  return Math.round((end - start) / (24 * 60 * 60 * 1000)) + 1;
}

/** Letzter Tag des Monats, etwa `28` für Februar 2025. */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
