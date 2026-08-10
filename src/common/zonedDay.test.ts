import { describe, expect, it } from 'vitest';
import { isoWeek, zonedDayRange, zonedParts } from './zonedDay';

const vienna = 'Europe/Vienna';

describe('zonedDayRange', () => {
  it('spans a month in the given zone', () => {
    expect(zonedDayRange('2025-06-01', '2025-06-30', vienna)).toEqual({
      fromIso: '2025-05-31T22:00:00.000Z',
      toIso: '2025-06-30T21:59:59.999Z',
    });
  });

  it('falls back to UTC for an unknown zone', () => {
    expect(zonedDayRange('2025-01-15', '2025-01-15', 'Nicht/Existent')).toEqual({
      fromIso: '2025-01-15T00:00:00.000Z',
      toIso: '2025-01-15T23:59:59.999Z',
    });
  });
});

describe('zonedParts', () => {
  it('resolves a late-evening UTC instant to the next local day', () => {
    // 23:30 UTC im Sommer ist in Wien 01:30 des Folgetags — eine Fahrt, die
    // sonst im falschen Monat landet.
    expect(zonedParts('2025-06-30T23:30:00.000Z', vienna)).toMatchObject({
      year: 2025,
      month: 7,
      day: 1,
      hour: 1,
    });
  });

  it('keeps the local day for a midday instant', () => {
    expect(zonedParts('2025-03-14T11:00:00.000Z', vienna)).toMatchObject({
      year: 2025,
      month: 3,
      day: 14,
    });
  });

  it('reports the ISO weekday with Monday as 1', () => {
    // 2025-03-14 ist ein Freitag, 2025-03-16 ein Sonntag.
    expect(zonedParts('2025-03-14T11:00:00.000Z', vienna)?.weekday).toBe(5);
    expect(zonedParts('2025-03-16T11:00:00.000Z', vienna)?.weekday).toBe(7);
  });

  it('returns undefined for an unparsable timestamp', () => {
    expect(zonedParts('keine Zeit', vienna)).toBeUndefined();
  });
});

describe('isoWeek', () => {
  it('counts the first week of a year that starts on a Wednesday', () => {
    expect(isoWeek(2025, 1, 1)).toEqual({ year: 2025, week: 1 });
  });

  it('assigns early January days to the previous ISO year', () => {
    // 2023-01-01 war ein Sonntag und gehört zur 52. Woche von 2022.
    expect(isoWeek(2023, 1, 1)).toEqual({ year: 2022, week: 52 });
  });

  it('assigns late December days to the next ISO year', () => {
    // 2024-12-30 war ein Montag und beginnt die 1. Woche von 2025.
    expect(isoWeek(2024, 12, 30)).toEqual({ year: 2025, week: 1 });
  });
});
