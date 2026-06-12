import { describe, expect, it } from 'vitest';
import {
  filterVisiblePoints,
  formatKm,
  StreckenkilometerPoint,
} from './streckenkilometerUtils';

const point = (
  strasse: string,
  km: number,
  lat: number,
  lng: number
): StreckenkilometerPoint => ({ strasse, km, lat, lng });

describe('formatKm', () => {
  it('formatiert ganze Kilometer mit einer Nachkommastelle und Komma', () => {
    expect(formatKm(43)).toBe('43,0');
  });

  it('formatiert halbe Kilometer', () => {
    expect(formatKm(42.5)).toBe('42,5');
  });

  it('rundet krumme Werte auf eine Nachkommastelle', () => {
    expect(formatKm(42.9579999)).toBe('43,0');
  });
});

describe('filterVisiblePoints', () => {
  const bounds = { south: 47.9, west: 16.7, north: 48.0, east: 16.9 };
  const inside = point('A4', 43, 47.95, 16.8);
  const insideHalf = point('A4', 43.5, 47.951, 16.81);
  const outside = point('A4', 50, 48.5, 17.5);

  it('liefert unterhalb Zoom 13 nichts', () => {
    expect(filterVisiblePoints([inside], 12, bounds)).toEqual([]);
  });

  it('liefert bei Zoom 13 nur ganze Kilometer innerhalb der Bounds', () => {
    expect(
      filterVisiblePoints([inside, insideHalf, outside], 13, bounds)
    ).toEqual([inside]);
  });

  it('liefert ab Zoom 15 auch Zwischen-Tafeln', () => {
    expect(
      filterVisiblePoints([inside, insideHalf, outside], 15, bounds)
    ).toEqual([inside, insideHalf]);
  });

  it('filtert Punkte außerhalb der Bounds', () => {
    expect(filterVisiblePoints([outside], 15, bounds)).toEqual([]);
  });

  it('behandelt fast-ganze km-Werte als ganze Kilometer', () => {
    const nearlyWhole = point('A4', 42.958, 47.96, 16.82);
    expect(filterVisiblePoints([nearlyWhole], 13, bounds)).toEqual([
      nearlyWhole,
    ]);
  });
});
