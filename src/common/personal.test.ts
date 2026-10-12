import { describe, expect, it } from 'vitest';
import {
  atemschutzPersons,
  driverPersons,
  isAtemschutztraeger,
  isKraftfahrer,
} from './personal';

describe('isKraftfahrer', () => {
  it('gilt ohne Angabe als Kraftfahrer', () => {
    expect(isKraftfahrer({})).toBe(true);
  });

  it('folgt einer ausdrücklichen Angabe', () => {
    expect(isKraftfahrer({ kraftfahrer: true })).toBe(true);
    expect(isKraftfahrer({ kraftfahrer: false })).toBe(false);
  });
});

describe('isAtemschutztraeger', () => {
  it('gilt ohne Angabe nicht als Atemschutzträger', () => {
    expect(isAtemschutztraeger({})).toBe(false);
  });

  it('folgt einer ausdrücklichen Angabe', () => {
    expect(isAtemschutztraeger({ atemschutztraeger: true })).toBe(true);
    expect(isAtemschutztraeger({ atemschutztraeger: false })).toBe(false);
  });
});

describe('Auswahllisten', () => {
  const persons = [
    { name: 'Muster Anna' },
    { name: 'Beispiel Bernd', kraftfahrer: false, atemschutztraeger: true },
    { name: 'Probe Clara', atemschutztraeger: true },
  ];

  it('bietet als Fahrer nur Kraftfahrer an', () => {
    expect(driverPersons(persons).map((p) => p.name)).toEqual([
      'Muster Anna',
      'Probe Clara',
    ]);
  });

  it('bietet für Atemschutz nur Atemschutzträger an', () => {
    expect(atemschutzPersons(persons).map((p) => p.name)).toEqual([
      'Beispiel Bernd',
      'Probe Clara',
    ]);
  });
});
