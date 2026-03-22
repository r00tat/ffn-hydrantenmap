// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { HydrantenRecord } from '../../../common/gis-objects';
import { formatLabel } from './HydrantenLabelsLayer';

const baseHydrant: HydrantenRecord = {
  name: 'Hauptplatz 3',
  lat: 47.9,
  lng: 16.8,
  ortschaft: 'Neusiedl',
  typ: 'Überflurhydrant',
  hydranten_nummer: '123',
  fuellhydrant: 'nein',
  dimension: 80,
  leitungsart: 'Transportleitung',
  statischer_druck: 5,
  dynamischer_druck: 3.5,
  druckmessung_datum: '2020-01-01',
  meereshoehe: 130,
  geohash: 'u2edk5',
  leistung: '1500',
};

describe('formatLabel', () => {
  it('shows all fields when present', () => {
    const lines = formatLabel(baseHydrant);
    expect(lines).toEqual([
      'Hauptplatz 3',
      '1500 l/min (80mm)',
      '3.5 bar dyn.',
      'Transportleitung',
    ]);
  });

  it('omits leistung line when leistung is missing', () => {
    const h = { ...baseHydrant, leistung: undefined, dimension: 0 };
    const lines = formatLabel(h);
    expect(lines).toEqual(['Hauptplatz 3', '3.5 bar dyn.', 'Transportleitung']);
  });

  it('omits dynamic pressure when zero', () => {
    const h = { ...baseHydrant, dynamischer_druck: 0 };
    const lines = formatLabel(h);
    expect(lines).not.toContain('0 bar dyn.');
  });

  it('omits leitungsart when empty', () => {
    const h = { ...baseHydrant, leitungsart: '' };
    const lines = formatLabel(h);
    expect(lines).not.toContain('');
    expect(lines).toHaveLength(3);
  });

  it('shows dimension only when leistung is missing', () => {
    const h = { ...baseHydrant, leistung: undefined };
    const lines = formatLabel(h);
    expect(lines[1]).toBe('(80mm)');
  });
});
