import { describe, expect, it } from 'vitest';
import { compareDiaryChronological } from './diary-order';

describe('compareDiaryChronological', () => {
  it('sortiert millisekundengenau, nicht nur nach Sekunden', () => {
    const abgezogen = { datum: '2026-10-13T09:00:00.100Z' };
    const zugeordnet = { datum: '2026-10-13T09:00:00.101Z' };
    expect([zugeordnet, abgezogen].sort(compareDiaryChronological)).toEqual([
      abgezogen,
      zugeordnet,
    ]);
  });

  it('nimmt bei gleichem Zeitpunkt die gespeicherte Nummer', () => {
    const datum = '2026-10-13T09:00:00.100Z';
    const erster = { datum, nummer: 4 };
    const zweiter = { datum, nummer: 5 };
    expect([zweiter, erster].sort(compareDiaryChronological)).toEqual([
      erster,
      zweiter,
    ]);
  });

  it('sortiert über Tagesgrenzen richtig', () => {
    const frueher = { datum: '2026-09-30T23:00:00.000Z' };
    const spaeter = { datum: '2026-10-01T01:00:00.000Z' };
    expect([spaeter, frueher].sort(compareDiaryChronological)).toEqual([
      frueher,
      spaeter,
    ]);
  });
});
