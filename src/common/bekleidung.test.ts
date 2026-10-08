import { describe, expect, it } from 'vitest';
import {
  bestandDocId,
  normalizeGroesse,
  normalizeTagNummer,
  totalWaschgaenge,
  waschLimitState,
} from './bekleidung';

describe('normalizeTagNummer', () => {
  it('schneidet ".0" ab und trimmt', () => {
    expect(normalizeTagNummer('22081702.0')).toBe('22081702');
    expect(normalizeTagNummer(' 30030030 ')).toBe('30030030');
    expect(normalizeTagNummer('1615236394')).toBe('1615236394');
  });

  it('liefert undefined für leere Werte', () => {
    expect(normalizeTagNummer('')).toBeUndefined();
    expect(normalizeTagNummer('   ')).toBeUndefined();
  });

  it('liest Zahlen in E-Schreibweise, wie sie manche Programme in die Datei schreiben', () => {
    expect(normalizeTagNummer('2.2081702E7')).toBe('22081702');
    expect(normalizeTagNummer('1.615186587E9')).toBe('1615186587');
    expect(normalizeTagNummer('6.00363681260005E14')).toBe('600363681260005');
    // Alphanumerische Nummer, die nur wie E-Schreibweise aussieht
    expect(normalizeTagNummer('7E97510003180001')).toBe('7E97510003180001');
  });

  it('lässt nicht numerische Nummern sonst unverändert', () => {
    expect(normalizeTagNummer(' AB-12 ')).toBe('AB-12');
  });
});

describe('normalizeGroesse', () => {
  it('trimmt, fasst Leerzeichen zusammen und schreibt groß', () => {
    expect(normalizeGroesse(' m3 ')).toBe('M3');
    expect(normalizeGroesse('52-54   c')).toBe('52-54 C');
  });
});

describe('bestandDocId', () => {
  it('enthält keinen Schrägstrich', () => {
    const id = bestandDocId('artikel1', '52/54 C');
    expect(id).not.toContain('/');
    expect(id.startsWith('artikel1__')).toBe(true);
  });

  it('ist gleich für gleich normalisierte Größen', () => {
    expect(bestandDocId('a', 'm3')).toBe(bestandDocId('a', ' M3 '));
  });

  it('unterscheidet verschiedene Größen', () => {
    expect(bestandDocId('a', '52/54')).not.toBe(bestandDocId('a', '52-54'));
  });
});

describe('totalWaschgaenge', () => {
  it('addiert Altbestand und gezählte Wäschen', () => {
    expect(totalWaschgaenge({ waschgaenge: 3, waschgaengeAltbestand: 7 })).toBe(10);
  });
});

describe('waschLimitState', () => {
  it('ist ok ohne Höchstzahl', () => {
    expect(
      waschLimitState({ waschgaenge: 100, waschgaengeAltbestand: 0 }, {}),
    ).toBe('ok');
  });

  it('ist near ab 90 % und reached ab der Höchstzahl', () => {
    const artikel = { maxWaschgaenge: 10 };
    expect(waschLimitState({ waschgaenge: 5, waschgaengeAltbestand: 3 }, artikel)).toBe('ok');
    expect(waschLimitState({ waschgaenge: 4, waschgaengeAltbestand: 5 }, artikel)).toBe('near');
    expect(waschLimitState({ waschgaenge: 2, waschgaengeAltbestand: 8 }, artikel)).toBe('reached');
    expect(waschLimitState({ waschgaenge: 12, waschgaengeAltbestand: 0 }, artikel)).toBe('reached');
  });
});
