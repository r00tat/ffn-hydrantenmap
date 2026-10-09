import { describe, expect, it } from 'vitest';
import { diffFields, formatFeldwert } from './geraetProtokoll';

describe('formatFeldwert', () => {
  it('gibt für leere Werte undefined zurück', () => {
    expect(formatFeldwert(undefined)).toBeUndefined();
    expect(formatFeldwert(null)).toBeUndefined();
    expect(formatFeldwert('')).toBeUndefined();
    expect(formatFeldwert('   ')).toBeUndefined();
  });

  it('trimmt Texte', () => {
    expect(formatFeldwert('  Schlauch B ')).toBe('Schlauch B');
  });

  it('schreibt Zahlen ohne Gebietsschema', () => {
    expect(formatFeldwert(1234.5)).toBe('1234.5');
    expect(formatFeldwert(0)).toBe('0');
  });

  it('schreibt Booleans als ja/nein', () => {
    expect(formatFeldwert(true)).toBe('ja');
    expect(formatFeldwert(false)).toBe('nein');
  });

  it('verbindet Arrays und lässt leere Einträge weg', () => {
    expect(formatFeldwert(['a', '', null, 2, true])).toBe('a, 2, ja');
    expect(formatFeldwert([])).toBeUndefined();
    expect(formatFeldwert(['', undefined])).toBeUndefined();
  });

  it('formatiert einen Lagerort', () => {
    expect(formatFeldwert({ art: 'fahrzeug', fahrzeug: 'SRF', laderaum: 'GR 2' })).toBe(
      'SRF · GR 2',
    );
  });

  it('schreibt andere Objekte als JSON', () => {
    expect(formatFeldwert({ a: 1 })).toBe('{"a":1}');
  });
});

interface Sample {
  name: string;
  mindestbestand?: number;
  codes?: string[];
  verbrauchsmaterial?: boolean;
  kommentar?: string;
}

describe('diffFields', () => {
  const fields = ['name', 'mindestbestand', 'codes', 'verbrauchsmaterial', 'kommentar'] as const;

  it('liefert nur geänderte Felder', () => {
    expect(
      diffFields<Sample>(
        { name: 'Ölbinder', mindestbestand: 5, codes: ['1'] },
        { name: 'Ölbinder', mindestbestand: 10, codes: ['1'] },
        fields,
      ),
    ).toEqual([{ feld: 'mindestbestand', vorher: '5', nachher: '10' }]);
  });

  it('behandelt undefined, null und leeren Text als gleich leer', () => {
    expect(
      diffFields<Sample>(
        { name: 'x', kommentar: '' },
        { name: 'x', kommentar: undefined, codes: [] },
        fields,
      ),
    ).toEqual([]);
  });

  it('lässt fehlende Seiten im Eintrag weg', () => {
    const result = diffFields<Sample>(
      { name: 'x' },
      { name: 'x', kommentar: 'neu', verbrauchsmaterial: false },
      fields,
    );
    expect(result).toEqual([
      { feld: 'verbrauchsmaterial', nachher: 'nein' },
      { feld: 'kommentar', nachher: 'neu' },
    ]);
    expect(Object.keys(result[1])).toEqual(['feld', 'nachher']);
  });

  it('ohne Vorher-Stand sind alle gesetzten Felder Änderungen', () => {
    expect(diffFields<Sample>(undefined, { name: 'neu', mindestbestand: 2 }, fields)).toEqual([
      { feld: 'name', nachher: 'neu' },
      { feld: 'mindestbestand', nachher: '2' },
    ]);
  });

  it('erkennt entfernte Werte', () => {
    expect(diffFields<Sample>({ name: 'x', codes: ['a', 'b'] }, { name: 'x' }, fields)).toEqual([
      { feld: 'codes', vorher: 'a, b' },
    ]);
  });
});
