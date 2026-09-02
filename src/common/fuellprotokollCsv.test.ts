import { describe, expect, it } from 'vitest';
import type { AtemschutzFuellung } from './atemschutz';
import {
  buildFuellprotokollCsv,
  csvZeitpunkt,
  FUELLPROTOKOLL_CSV_SPALTEN,
  fuellungCsvZeile,
  fuellungDublettenSchluessel,
  parseCsvRaster,
  parseFuellprotokollCsv,
} from './fuellprotokollCsv';

function fuellung(over: Partial<AtemschutzFuellung> = {}): AtemschutzFuellung {
  return {
    id: 'f1',
    flaschenNummer: '2.16.19',
    feuerwehr: 'Neusiedl am See',
    anzahl: 1,
    startdruck: 50,
    enddruck: 300,
    gefuelltVon: 'Max Muster',
    zeitpunkt: new Date(2026, 8, 2, 16, 35).toISOString(),
    firecallId: '',
    verrechnen: false,
    createdAt: '',
    createdBy: 'u1',
    updatedAt: '',
    updatedBy: 'u1',
    ...over,
  };
}

describe('parseCsvRaster', () => {
  it('erkennt das Semikolon der deutschsprachigen Tabellenkalkulation', () => {
    expect(parseCsvRaster('a;b;c\n1;2;3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('erkennt Komma, wenn kein Semikolon in der Kopfzeile steht', () => {
    expect(parseCsvRaster('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('liest ein Feld mit Trennzeichen und Zeilenumbruch in Anführungszeichen', () => {
    expect(parseCsvRaster('a;b\n"eins;zwei";"drei\nvier"')).toEqual([
      ['a', 'b'],
      ['eins;zwei', 'drei\nvier'],
    ]);
  });

  it('liest ein verdoppeltes Anführungszeichen als eines', () => {
    expect(parseCsvRaster('a\n"sagte ""hallo"""')).toEqual([
      ['a'],
      ['sagte "hallo"'],
    ]);
  });

  it('wirft das BOM weg und überspringt leere Zeilen', () => {
    expect(parseCsvRaster('﻿a;b\r\n1;2\r\n;;\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('csvZeitpunkt', () => {
  it('liest Tag.Monat.Jahr in Ortszeit', () => {
    expect(csvZeitpunkt('02.09.2026', '16:35')).toBe(
      new Date(2026, 8, 2, 16, 35).toISOString(),
    );
  });

  it('liest auch die ISO-Schreibweise', () => {
    expect(csvZeitpunkt('2026-09-02', '16:35')).toBe(
      new Date(2026, 8, 2, 16, 35).toISOString(),
    );
  });

  it('nimmt eine fehlende Uhrzeit als Mitternacht', () => {
    expect(csvZeitpunkt('02.09.2026', '')).toBe(
      new Date(2026, 8, 2, 0, 0).toISOString(),
    );
  });

  it('lehnt ein Datum ab, das es nicht gibt', () => {
    // `new Date(2026, 1, 30)` wäre still der 2. März.
    expect(csvZeitpunkt('30.02.2026', '10:00')).toBeUndefined();
    expect(csvZeitpunkt('kaputt', '10:00')).toBeUndefined();
  });
});

describe('fuellungCsvZeile', () => {
  it('schreibt die Spalten in der Reihenfolge der Kopfzeile', () => {
    const zeile = fuellungCsvZeile(
      fuellung({
        fuellstationName: 'Kompressor 1',
        firecallName: 'Brand K1',
        zweck: 'einsatz',
        verrechnen: true,
        sichtkontrolle: 'mangel',
        bemerkung: 'Ventil schwergängig',
      }),
    );
    expect(zeile).toHaveLength(FUELLPROTOKOLL_CSV_SPALTEN.length);
    expect(zeile).toEqual([
      '02.09.2026',
      '16:35',
      '2.16.19',
      'Neusiedl am See',
      '1',
      '50',
      '300',
      'Max Muster',
      'Kompressor 1',
      'Brand K1',
      'Einsatz',
      'ja',
      'Mangel',
      'Ventil schwergängig',
    ]);
  });

  it('nimmt die Kennung aus den Stammdaten, wenn sie mitgegeben wird', () => {
    const zeile = fuellungCsvZeile(fuellung(), { kennung: '2.16.20' });
    expect(zeile[2]).toBe('2.16.20');
  });

  it('leitet den Zweck einer Altzeile aus dem Einsatzbezug ab', () => {
    expect(fuellungCsvZeile(fuellung({ firecallId: 'e1' }))[10]).toBe('Einsatz');
    expect(fuellungCsvZeile(fuellung())[10]).toBe('Sonstiges');
  });
});

describe('parseFuellprotokollCsv', () => {
  const kopf = FUELLPROTOKOLL_CSV_SPALTEN.join(';');

  it('liest eine exportierte Datei wieder ein (Round-Trip)', () => {
    const original = fuellung({
      fuellstationName: 'Kompressor 1',
      firecallName: 'Brand K1',
      zweck: 'uebung',
      verrechnen: true,
      sichtkontrolle: 'ok',
      bemerkung: 'Text mit ; Semikolon',
    });
    const csv = buildFuellprotokollCsv([fuellungCsvZeile(original)]);

    const { zeilen, fehler } = parseFuellprotokollCsv(csv);
    expect(fehler).toBeUndefined();
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0].fuellung).toEqual({
      zeitpunkt: original.zeitpunkt,
      flaschenNummer: '2.16.19',
      feuerwehr: 'Neusiedl am See',
      anzahl: 1,
      startdruck: 50,
      enddruck: 300,
      gefuelltVon: 'Max Muster',
      fuellstationName: 'Kompressor 1',
      firecallName: 'Brand K1',
      zweck: 'uebung',
      verrechnen: true,
      sichtkontrolle: 'ok',
      bemerkung: 'Text mit ; Semikolon',
    });
  });

  it('meldet fehlende Pflichtspalten für die ganze Datei', () => {
    expect(parseFuellprotokollCsv('Flasche;Feuerwehr\na;b').fehler).toBe(
      'columnsMissing',
    );
  });

  it('meldet eine leere Datei', () => {
    expect(parseFuellprotokollCsv('').fehler).toBe('fileEmpty');
  });

  it('hält eine kaputte Zeile fest, ohne die übrigen zu verlieren', () => {
    const csv = [
      kopf,
      'kaputt;10:00;2.16.19;;1;;300;Max',
      '02.09.2026;16:35;2.16.20;;1;;300;Max',
    ].join('\n');

    const { zeilen } = parseFuellprotokollCsv(csv);
    expect(zeilen).toHaveLength(2);
    expect(zeilen[0]).toMatchObject({ zeile: 2, fehler: 'dateInvalid' });
    expect(zeilen[1].fuellung?.flaschenNummer).toBe('2.16.20');
  });

  it('lehnt eine Zeile ohne Flasche und ohne Feuerwehr ab', () => {
    const csv = [kopf, '02.09.2026;16:35;;;1;;300;Max'].join('\n');
    expect(parseFuellprotokollCsv(csv).zeilen[0].fehler).toBe(
      'identifierMissing',
    );
  });

  it('lehnt einen Startdruck über dem Enddruck ab', () => {
    const csv = [kopf, '02.09.2026;16:35;2.16.19;;1;310;300;Max'].join('\n');
    expect(parseFuellprotokollCsv(csv).zeilen[0].fehler).toBe(
      'startdruckAboveEnddruck',
    );
  });

  it('zwingt eine Zeile mit Flaschennummer auf die Anzahl 1', () => {
    const csv = [kopf, '02.09.2026;16:35;2.16.19;;5;;300;Max'].join('\n');
    expect(parseFuellprotokollCsv(csv).zeilen[0].fuellung?.anzahl).toBe(1);
  });

  it('lässt die Sammelerfassung ohne Nummer zu', () => {
    const csv = [kopf, '02.09.2026;16:35;;FF Jois;5;;300;Max'].join('\n');
    expect(parseFuellprotokollCsv(csv).zeilen[0].fuellung?.anzahl).toBe(5);
  });

  it('liest „Ubung" ohne Umlaut und den Schlüssel selbst', () => {
    const zeile = (zweck: string) =>
      parseFuellprotokollCsv(
        [kopf, `02.09.2026;16:35;2.16.19;;1;;300;Max;;;${zweck};nein`].join('\n'),
      ).zeilen[0].fuellung?.zweck;
    expect(zeile('Übung')).toBe('uebung');
    expect(zeile('Ubung')).toBe('uebung');
    expect(zeile('uebung')).toBe('uebung');
  });

  it('leitet einen fehlenden Zweck aus der Einsatzspalte ab', () => {
    const mit = [kopf, '02.09.2026;16:35;2.16.19;;1;;300;Max;;Brand K1;;nein'];
    const ohne = [kopf, '02.09.2026;16:35;2.16.19;;1;;300;Max;;;;nein'];
    expect(parseFuellprotokollCsv(mit.join('\n')).zeilen[0].fuellung?.zweck).toBe(
      'einsatz',
    );
    expect(parseFuellprotokollCsv(ohne.join('\n')).zeilen[0].fuellung?.zweck).toBe(
      'sonstiges',
    );
  });

  it('liest nur eindeutige Ja-Werte als „verrechnen"', () => {
    const zeile = (wert: string) =>
      parseFuellprotokollCsv(
        [kopf, `02.09.2026;16:35;2.16.19;;1;;300;Max;;;;${wert}`].join('\n'),
      ).zeilen[0].fuellung?.verrechnen;
    expect(zeile('ja')).toBe(true);
    expect(zeile('X')).toBe(true);
    expect(zeile('nein')).toBe(false);
    expect(zeile('vielleicht')).toBe(false);
  });
});

describe('fuellungDublettenSchluessel', () => {
  const basis = {
    flaschenNummer: '2.16.19',
    feuerwehr: 'Neusiedl am See',
    zeitpunkt: '2026-09-02T14:35:12.000Z',
  };

  it('ignoriert die Sekunden — die Datei trägt nur Minuten', () => {
    expect(fuellungDublettenSchluessel(basis)).toBe(
      fuellungDublettenSchluessel({
        ...basis,
        zeitpunkt: '2026-09-02T14:35:59.000Z',
      }),
    );
  });

  it('ignoriert die Schreibweise der Flaschennummer', () => {
    expect(fuellungDublettenSchluessel(basis)).toBe(
      fuellungDublettenSchluessel({ ...basis, flaschenNummer: '2-16-19' }),
    );
  });

  it('unterscheidet zwei Flaschen in derselben Minute', () => {
    expect(fuellungDublettenSchluessel(basis)).not.toBe(
      fuellungDublettenSchluessel({ ...basis, flaschenNummer: '2.16.20' }),
    );
  });
});
