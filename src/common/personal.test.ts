import { describe, expect, it } from 'vitest';
import {
  atemschutzPersons,
  driverPersons,
  isAtemschutztraeger,
  isExtern,
  isKraftfahrer,
  memberPersons,
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

describe('Externe', () => {
  it('gilt ohne Angabe als Mitglied', () => {
    expect(isExtern({})).toBe(false);
    expect(isExtern({ extern: true })).toBe(true);
  });

  it('ist weder Kraftfahrer noch Atemschutzträger, was auch eingetragen ist', () => {
    const extern = { extern: true, kraftfahrer: true, atemschutztraeger: true };
    expect(isKraftfahrer(extern)).toBe(false);
    expect(isAtemschutztraeger(extern)).toBe(false);
  });

  it('fehlt in den Auswahllisten, inaktive Mitglieder ebenso', () => {
    const persons = [
      { name: 'Muster Anna', atemschutztraeger: true },
      { name: 'Gast Gustav', extern: true, atemschutztraeger: true },
      { name: 'Alt Otto', active: false },
    ];
    expect(driverPersons(persons).map((p) => p.name)).toEqual([
      'Muster Anna',
      'Alt Otto',
    ]);
    expect(atemschutzPersons(persons).map((p) => p.name)).toEqual([
      'Muster Anna',
    ]);
    expect(memberPersons(persons).map((p) => p.name)).toEqual(['Muster Anna']);
  });
});
