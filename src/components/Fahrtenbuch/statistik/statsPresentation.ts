'use client';

/**
 * Beschriftungen und Farben der Statistik-Diagramme.
 *
 * Getrennt von der Rechnung (`src/common/fahrtenbuchStats*.ts`): Dort entstehen
 * Zahlen und Schlüssel, hier werden sie in der Sprache und im Farbschema des
 * Benutzers dargestellt.
 */

import type { Theme } from '@mui/material/styles';
import {
  FAHRT_ZWECKE,
  FUEL_TYPES,
  type FahrtZweck,
  type FuelType,
} from '../../../common/fahrtenbuch';
import {
  bucketDayRange,
  type StatsGranularity,
  type StatsMetric,
} from '../../../common/fahrtenbuchStats';
import { OTHER_STACK_KEY } from '../../../common/fahrtenbuchStatsSeries';

/**
 * Farbe eines Fahrtzwecks. Fest zugeordnet, nicht aus einer Reihenfolge
 * abgeleitet: Derselbe Zweck soll in jedem Diagramm dieselbe Farbe haben, auch
 * wenn er in einem davon fehlt. Rot für den Einsatz folgt der Erwartung.
 */
export function zweckColor(theme: Theme, zweck: string): string {
  switch (zweck as FahrtZweck) {
    case 'einsatz':
      return theme.palette.error.main;
    case 'uebung':
      return theme.palette.info.main;
    case 'versorgung':
      return theme.palette.success.main;
    case 'sonstiges':
      return theme.palette.warning.main;
    default:
      return theme.palette.grey[500];
  }
}

export function fuelColor(theme: Theme, fuel: string): string {
  switch (fuel as FuelType) {
    case 'diesel':
      return theme.palette.primary.main;
    case 'benzin':
      return theme.palette.secondary.main;
    case 'adblue':
      return theme.palette.info.light;
    default:
      return theme.palette.grey[500];
  }
}

/** Farbverlauf für Reihen ohne feste Bedeutung — Fahrzeuge, Fahrer. */
export function seriesColor(theme: Theme, index: number): string {
  const palette = [
    theme.palette.primary.main,
    theme.palette.secondary.main,
    theme.palette.success.main,
    theme.palette.warning.main,
    theme.palette.info.main,
    theme.palette.error.main,
    theme.palette.primary.light,
    theme.palette.secondary.light,
  ];
  return palette[index % palette.length];
}

/** Die Farbe einer Reihe, abhängig davon, wonach gestapelt wurde. */
export function stackColor(
  theme: Theme,
  stackBy: string,
  key: string,
  index: number,
): string {
  if (key === OTHER_STACK_KEY) return theme.palette.grey[500];
  if (stackBy === 'zweck') return zweckColor(theme, key);
  if (stackBy === 'fuel') return fuelColor(theme, key);
  return seriesColor(theme, index);
}

/**
 * Ein Referenzmontag für die Wochentagsnamen. Der 1. Januar 2024 war ein
 * Montag; damit lassen sich die Namen aus der Locale holen, ohne sie zu
 * hinterlegen.
 */
const REFERENCE_MONDAY = Date.UTC(2024, 0, 1);

export function weekdayLabel(locale: string, weekday: string): string {
  const index = Number(weekday);
  if (!Number.isFinite(index) || index < 1 || index > 7) return weekday;
  const date = new Date(REFERENCE_MONDAY + (index - 1) * 86400000);
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      timeZone: 'UTC',
    }).format(date);
  } catch {
    return weekday;
  }
}

/**
 * Beschriftung eines Zeitabschnitts: `14.03.`, `KW 11`, `Mär 2025`, `2025`.
 *
 * Der Tag zeigt kein Jahr — auf einer Achse mit 31 Balken wäre es 31-mal
 * dieselbe Angabe, und der Zeitraum steht ohnehin in der Filterzeile.
 */
export function bucketLabel(
  locale: string,
  key: string,
  granularity: StatsGranularity,
  weekPrefix: string,
): string {
  if (granularity === 'year') return key;
  if (granularity === 'week') {
    const match = /^\d{4}-W(\d{2})$/.exec(key);
    return match ? `${weekPrefix}${Number(match[1])}` : key;
  }
  const range = bucketDayRange(key, granularity);
  if (!range) return key;
  const date = new Date(`${range.from}T12:00:00.000Z`);
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      ...(granularity === 'day'
        ? { day: '2-digit', month: '2-digit' }
        : { month: 'short', year: 'numeric' }),
    }).format(date);
  } catch {
    return key;
  }
}

/** Ganze Stunden und Minuten einer Dauer — `95` → `{ hours: 1, minutes: 35 }`. */
export function splitDuration(totalMinutes: number): {
  hours: number;
  minutes: number;
} {
  const rounded = Math.max(0, Math.round(totalMinutes));
  return { hours: Math.floor(rounded / 60), minutes: rounded % 60 };
}

/** Die Einheit, in der eine Kennzahl gemessen wird — für Achse und Tooltip. */
export function metricUnitLabel(
  metric: StatsMetric,
  units: { trips: string; duration: string; fuel: string },
): string {
  if (metric === 'trips') return units.trips;
  if (metric === 'duration') return units.duration;
  if (metric === 'fuel') return units.fuel;
  return metric.slice('unit:'.length);
}

export const ALL_ZWECKE = FAHRT_ZWECKE;
export const ALL_FUELS = FUEL_TYPES;
