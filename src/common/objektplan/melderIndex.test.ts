import { describe, expect, it } from 'vitest';
import {
  findMelderInText,
  matchesMelderQuery,
  parseMelderQuery,
  searchPageTexts,
  textItemBox,
  type MelderEntry,
} from './melderIndex';

describe('findMelderInText', () => {
  it('erkennt Gruppe/Melder mit und ohne Zusatz', () => {
    expect(findMelderInText('3/05')).toEqual([
      { kennung: '3/05', gruppe: 3, melder: 5, start: 0, end: 4 },
    ]);
    expect(findMelderInText('4/01E')).toEqual([
      { kennung: '4/01E', gruppe: 4, melder: 1, zusatz: 'E', start: 0, end: 5 },
    ]);
  });

  it('findet mehrere Kennungen in einem Textstück samt Position', () => {
    const hits = findMelderInText('OG AR.PUTZMITTEL T30 51/1E  18/2');
    expect(hits.map((h) => h.kennung)).toEqual(['51/1E', '18/2']);
    expect(hits[0].start).toBe(21);
  });

  it('nimmt eine Kennung nach Buchstaben oder Punkt an', () => {
    expect(findMelderInText('STGH.18/2').map((h) => h.kennung)).toEqual(['18/2']);
  });

  it('ignoriert Telefonnummern, Brüche mit langen Zahlen und Daten mit Jahr', () => {
    expect(findMelderInText('T: 02742/350-0')).toEqual([]);
    expect(findMelderInText('M 1/100')).toEqual([]);
    expect(findMelderInText('17/05/2011')).toEqual([]);
  });

  it('erkennt vierstellige Meldergruppen (Siemens-Pläne)', () => {
    expect(findMelderInText('1003/04 1009/04( 1004/01E').map((h) => h.kennung)).toEqual([
      '1003/04',
      '1009/04',
      '1004/01E',
    ]);
    expect(findMelderInText('1003/04')[0]).toMatchObject({ gruppe: 1003, melder: 4 });
  });

  it('ignoriert fünfstellige Gruppen', () => {
    expect(findMelderInText('12345/01')).toEqual([]);
  });

  it('ignoriert Melder- oder Gruppennummer 0', () => {
    expect(findMelderInText('0/5 3/0')).toEqual([]);
  });

  it('nimmt keinen Zusatz aus einem folgenden Wort', () => {
    expect(findMelderInText('3/05EG')).toEqual([]);
    expect(findMelderInText('3/05 EG').map((h) => h.kennung)).toEqual(['3/05']);
  });
});

describe('parseMelderQuery', () => {
  it.each([
    ['3/5', { gruppe: 3, melder: 5 }],
    ['3/05', { gruppe: 3, melder: 5 }],
    ['3 / 05e', { gruppe: 3, melder: 5 }],
    ['3-5', { gruppe: 3, melder: 5 }],
    ['MG 3 M 5', { gruppe: 3, melder: 5 }],
    ['MG3/M5', { gruppe: 3, melder: 5 }],
    ['Meldergruppe 12 Melder 3', { gruppe: 12, melder: 3 }],
    ['MG 12', { gruppe: 12 }],
    ['Gruppe 12', { gruppe: 12 }],
    ['12', { gruppe: 12 }],
    ['1003/04', { gruppe: 1003, melder: 4 }],
    ['1003', { gruppe: 1003 }],
    // Gruppe eingetippt, Meldernummer noch nicht
    ['310/', { gruppe: 310 }],
    ['310 / ', { gruppe: 310 }],
    ['3-', { gruppe: 3 }],
    ['MG 3 M', { gruppe: 3 }],
  ])('%s', (input, expected) => {
    expect(parseMelderQuery(input)).toEqual(expected);
  });

  it.each(['', 'Heizraum', '3/5/7', '12345', 'MG', '/', '3//'])('kein Melder: %s', (input) => {
    expect(parseMelderQuery(input)).toBeNull();
  });
});

describe('matchesMelderQuery', () => {
  const entry: MelderEntry = {
    kennung: '3/05E',
    gruppe: 3,
    melder: 5,
    zusatz: 'E',
    seite: 2,
    box: [0, 0, 0.1, 0.1],
  };
  it('passt auf Gruppe und Melder', () => {
    expect(matchesMelderQuery(entry, { gruppe: 3, melder: 5 })).toBe(true);
    expect(matchesMelderQuery(entry, { gruppe: 3 })).toBe(true);
    expect(matchesMelderQuery(entry, { gruppe: 3, melder: 6 })).toBe(false);
    expect(matchesMelderQuery(entry, { gruppe: 30 })).toBe(false);
  });
});

describe('searchPageTexts', () => {
  const pages = ['Heizraum im Keller', '', 'Zugang Heizraum über Hof, HEIZRAUM 2'];
  it('findet Seiten ohne Rücksicht auf Groß-/Kleinschreibung', () => {
    const hits = searchPageTexts(pages, 'heizraum');
    expect(hits.map((h) => h.seite)).toEqual([1, 3]);
    expect(hits[1].count).toBe(2);
    expect(hits[0].snippet).toContain('Heizraum');
  });

  it('sucht erst ab zwei Zeichen', () => {
    expect(searchPageTexts(pages, 'h')).toEqual([]);
  });
});

describe('textItemBox', () => {
  // Hochformat 100 × 200, Ursprung unten links; das Viewport dreht die
  // y-Achse um, wie pdfjs bei Drehung 0.
  const toViewport = (x: number, y: number): [number, number] => [x, 200 - y];
  const size = { width: 100, height: 200 };

  it('normiert waagrechten Text auf 0..1 mit Ursprung oben links', () => {
    const box = textItemBox(
      { transform: [10, 0, 0, 10, 20, 50], width: 40, height: 10 },
      [0, 1],
      toViewport,
      size,
    );
    expect(box[0]).toBeCloseTo(0.2);
    expect(box[2]).toBeCloseTo(0.6);
    // Oberkante bei y=60 → 140/200, Unterkante samt Unterlänge unter y=50.
    expect(box[1]).toBeCloseTo(0.7);
    expect(box[3]).toBeGreaterThan(0.75);
    expect(box[3]).toBeLessThan(0.77);
  });

  it('schneidet den Teilbereich einer Kennung aus dem Textstück', () => {
    const box = textItemBox(
      { transform: [10, 0, 0, 10, 20, 50], width: 40, height: 10 },
      [0.5, 1],
      toViewport,
      size,
    );
    expect(box[0]).toBeCloseTo(0.4);
    expect(box[2]).toBeCloseTo(0.6);
  });

  it('dreht senkrechten Text mit', () => {
    // Text läuft nach oben: Richtung (0,1), „oben" zeigt nach links.
    const box = textItemBox(
      { transform: [0, 10, -10, 0, 50, 20], width: 40, height: 10 },
      [0, 1],
      toViewport,
      size,
    );
    // x: von 40 (Oberkante links) bis gut 50; y: 20..60 → 140..180.
    expect(box[0]).toBeCloseTo(0.4);
    expect(box[2]).toBeGreaterThan(0.5);
    expect(box[1]).toBeCloseTo(0.7);
    expect(box[3]).toBeCloseTo(0.9);
  });
});
