/**
 * Die Zeitraum-Vorgaben der Statistik. Reine Tagesrechnung — der heutige Tag
 * kommt als Parameter herein, damit die Vorgaben prüfbar bleiben und in der
 * Zeitzone des Benutzers gelten.
 */

import { addDays, lastDayOfMonth, parseIsoDay, toIsoDay } from './zonedDay';

export type StatsRangePreset =
  | 'thisMonth'
  | 'lastMonth'
  | 'last30Days'
  | 'thisQuarter'
  | 'thisYear'
  | 'lastYear'
  | 'last12Months'
  | 'custom';

export const STATS_RANGE_PRESETS: StatsRangePreset[] = [
  'thisMonth',
  'lastMonth',
  'last30Days',
  'thisQuarter',
  'thisYear',
  'lastYear',
  'last12Months',
  'custom',
];

export interface DayRange {
  from: string;
  to: string;
}

/**
 * Der Zeitraum einer Vorgabe.
 *
 * Laufende Zeiträume enden heute, abgeschlossene am letzten Tag des Zeitraums:
 * Ein „laufendes Jahr" bis zum 31. Dezember hätte auf der Zeitachse leere
 * Monate in der Zukunft, ein „Vorjahr" bis heute wäre falsch.
 *
 * `undefined` für `custom` — dort gilt, was der Benutzer eingestellt hat.
 */
export function presetRange(
  preset: StatsRangePreset,
  today: string,
): DayRange | undefined {
  const parts = parseIsoDay(today);
  if (!parts) return undefined;
  const { year, month } = parts;

  switch (preset) {
    case 'thisMonth':
      return { from: toIsoDay(year, month, 1), to: today };
    case 'lastMonth': {
      const prevYear = month === 1 ? year - 1 : year;
      const prevMonth = month === 1 ? 12 : month - 1;
      return {
        from: toIsoDay(prevYear, prevMonth, 1),
        to: toIsoDay(prevYear, prevMonth, lastDayOfMonth(prevYear, prevMonth)),
      };
    }
    case 'last30Days':
      return { from: addDays(today, -29), to: today };
    case 'thisQuarter': {
      const firstMonth = Math.floor((month - 1) / 3) * 3 + 1;
      return { from: toIsoDay(year, firstMonth, 1), to: today };
    }
    case 'thisYear':
      return { from: toIsoDay(year, 1, 1), to: today };
    case 'lastYear':
      return { from: toIsoDay(year - 1, 1, 1), to: toIsoDay(year - 1, 12, 31) };
    case 'last12Months': {
      // Elf Monate zurück auf den Monatsersten: zwölf Monate einschließlich des
      // laufenden.
      const startMonth = ((month - 12) % 12 + 12) % 12 + 1;
      const startYear = month - 11 <= 0 ? year - 1 : year;
      return { from: toIsoDay(startYear, startMonth, 1), to: today };
    }
    default:
      return undefined;
  }
}
