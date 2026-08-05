import { describe, expect, it } from 'vitest';
import {
  columnSeparators,
  groupRows,
  mergeAdjacent,
  parseFahrtenbuchPdf,
  refineWithHeader,
  splitTrailingNumber,
  toIsoTimestamp,
  type PdfTextItem,
} from './fahrtenbuchPdfImport';

/**
 * x-Startpositionen der elf Spalten, den Maßen des echten Exports nachgebaut.
 * Die Abstände sind so gewählt, dass zwischen zwei Überschriften mehr als
 * `mergeAdjacent`s Schwelle von 8 Punkten liegt — sonst verschmölzen sie zu
 * einer Zelle.
 */
const COL_X = [40, 95, 165, 265, 330, 490, 545, 600, 650, 715, 790];
const CHAR = 5;

function item(text: string, x: number, y: number): PdfTextItem {
  return { text, x, y, width: text.length * CHAR };
}

/** Eine Zeile aus elf Zellen; leere Zellen entfallen wie im echten PDF. */
function row(y: number, cells: (string | undefined)[]): PdfTextItem[] {
  return cells.flatMap((text, index) =>
    text === undefined || text === '' ? [] : [item(text, COL_X[index], y)],
  );
}

const HEADER = row(700, [
  'Datum',
  'Zeit',
  'Fahrer',
  'Grund',
  'Zweck/Strecke',
  'Start KM',
  'Ende KM',
  'Gef. KM',
  'Treibstoff',
  'AdBlue',
  'Notizen',
]);

const TITLE = [item('Fahrtenbuch: KDTFA (FW-205ND)', 300, 780)];

function page(...dataRows: PdfTextItem[][]): PdfTextItem[] {
  return [...TITLE, ...HEADER, ...dataRows.flat()];
}

function normalRow(y: number, index: number): PdfTextItem[] {
  return row(y, [
    '04.06.2025',
    '17:40 - 18:00',
    'Anna Muster',
    'Sonstiges',
    'Besorgung',
    `14,${600 + index}`,
    `14,${610 + index}`,
    '10',
    '-',
    '-',
    '',
  ]);
}

/** Genug gewöhnliche Zeilen, damit die Trennerkennung tragfähig ist. */
function filler(count: number): PdfTextItem[][] {
  return Array.from({ length: count }, (_, i) => normalRow(650 - i * 15, i));
}

/**
 * Die Zeile mit dem Überlauf. Die Breite wird gesetzt statt aus der
 * Textlänge gerechnet: entscheidend ist, dass der Text nur bis in die
 * Start-KM-Zelle reicht und nicht darüber hinaus — genau so steht es im
 * echten Export.
 */
const OVERFLOW_Y = -300;
const OVERFLOW_ROW: PdfTextItem[] = [
  item('11.09.2025', COL_X[0], OVERFLOW_Y),
  item('16:45 - 17:19', COL_X[1], OVERFLOW_Y),
  item('Bea Beispiel', COL_X[2], OVERFLOW_Y),
  item('Einsatz', COL_X[3], OVERFLOW_Y),
  {
    text: 'Eigener Einsatzbereich - T1 Verkehrswege freimachen15,134',
    x: COL_X[4],
    y: OVERFLOW_Y,
    // endet bei 330 + 190 = 520, also am rechten Rand der Start-KM-Spalte
    width: 190,
  },
  // Keine Start-KM-Zelle: ihr Wert klebt am Text der Zweck-Spalte.
  item('15,142', COL_X[6], OVERFLOW_Y),
  item('8', COL_X[7], OVERFLOW_Y),
  item('-', COL_X[8], OVERFLOW_Y),
  item('-', COL_X[9], OVERFLOW_Y),
];

describe('groupRows', () => {
  it('fasst Items gleicher Höhe zu einer Zeile zusammen und sortiert nach x', () => {
    const rows = groupRows([
      item('rechts', 200, 500),
      item('links', 40, 501),
      item('darunter', 40, 480),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].map((i) => i.text)).toEqual(['links', 'rechts']);
    expect(rows[1].map((i) => i.text)).toEqual(['darunter']);
  });
});

describe('columnSeparators', () => {
  it('lässt einen einzelnen Überläufer den Trenner nicht schließen', () => {
    const separators = columnSeparators([...filler(50), OVERFLOW_ROW]);
    // Zwischen Zweck- (endet bei 375) und Start-KM-Spalte (beginnt bei 490)
    // muss trotz des Überläufers ein Trenner liegen.
    expect(separators.some((s) => s > 375 && s < 490)).toBe(true);
  });
});

describe('refineWithHeader', () => {
  it('ergänzt den Trenner einer fast immer leeren Spalte', () => {
    // Notizen ist in allen Füllzeilen leer, hinterlässt also keine Belegung.
    // Ohne die Kopfzeile fiele die Spalte mit AdBlue in eine Zelle.
    const dataOnly = columnSeparators(filler(50));
    expect(dataOnly).toHaveLength(9);

    const refined = refineWithHeader(dataOnly, mergeAdjacent(HEADER));
    // Elf Spalten brauchen zehn Trenner.
    expect(refined).toHaveLength(10);
    // AdBlue endet bei 745, Notizen beginnt bei 790.
    expect(refined.some((s) => s > 745 && s < 790)).toBe(true);
  });

  it('zieht keine Spalte ein, wo die Daten schon einen Trenner liefern', () => {
    const dataOnly = columnSeparators(filler(50));
    const refined = refineWithHeader(dataOnly, mergeAdjacent(HEADER));
    expect(refined.filter((s) => s > 375 && s < 490)).toHaveLength(1);
  });
});

describe('mergeAdjacent', () => {
  it('fasst eine zweiteilige Überschrift zusammen', () => {
    const merged = mergeAdjacent([
      item('Start', 490, 700),
      item('KM', 517, 700),
      item('Ende', 545, 700),
    ]);
    expect(merged.map((i) => i.text)).toEqual(['Start KM', 'Ende']);
  });
});

describe('splitTrailingNumber', () => {
  it('trennt eine angeklebte Kilometerzahl ab', () => {
    expect(splitTrailingNumber('T1 Verkehrswege freimachen15,134')).toEqual({
      text: 'T1 Verkehrswege freimachen',
      number: '15,134',
    });
  });

  it('lässt reinen Text unangetastet', () => {
    expect(splitTrailingNumber('BMA Penny')).toEqual({ text: 'BMA Penny' });
  });

  it('trennt nichts ab, wenn nur die Zahl dasteht', () => {
    expect(splitTrailingNumber('15,134')).toEqual({ text: '15,134' });
  });

  it('trennt auch einen Stand ohne Tausendertrenner ab', () => {
    // Unter 1000 km — bei einem Anhänger oder neuen Fahrzeug der Normalfall.
    expect(splitTrailingNumber('T1 Verkehrswege freimachen946')).toEqual({
      text: 'T1 Verkehrswege freimachen',
      number: '946',
    });
  });

  it('lässt eine Zahl stehen, die zum Text gehört', () => {
    // Leerzeichen davor: die Zahl ist Teil der Bezeichnung, nicht verklebt.
    expect(splitTrailingNumber('Einsatz Halle 3')).toEqual({
      text: 'Einsatz Halle 3',
    });
    expect(splitTrailingNumber('Objekt 123')).toEqual({ text: 'Objekt 123' });
    // Zu kurz, um ein Kilometerstand zu sein.
    expect(splitTrailingNumber('Bergung A4')).toEqual({ text: 'Bergung A4' });
  });

  it('zerlegt eine reine Zahl ohne Trenner nicht', () => {
    expect(splitTrailingNumber('14646')).toEqual({ text: '14646' });
  });
});

describe('toIsoTimestamp', () => {
  it('liest Datum und Uhrzeit als Ortszeit', () => {
    const iso = toIsoTimestamp('04.06.2025', '17:40');
    expect(new Date(iso as string).getFullYear()).toBe(2025);
    expect(new Date(iso as string).getHours()).toBe(17);
    expect(new Date(iso as string).getMinutes()).toBe(40);
  });

  it('meldet ein unlesbares Datum', () => {
    expect(toIsoTimestamp('kein Datum', '17:40')).toBeUndefined();
  });

  it('weist ein unmögliches Datum ab, statt es weiterzurollen', () => {
    // `new Date(2025, 1, 31)` ergibt den 03.03.2025 und nie `NaN`. Ohne
    // Rückvergleich stünde die Fahrt mit falschem Datum im Nachweisdokument.
    expect(toIsoTimestamp('31.02.2025', '10:00')).toBeUndefined();
    expect(toIsoTimestamp('32.01.2025', '10:00')).toBeUndefined();
    expect(toIsoTimestamp('01.13.2025', '10:00')).toBeUndefined();
  });

  it('nimmt den 29. Februar eines Schaltjahres an', () => {
    expect(toIsoTimestamp('29.02.2024', '10:00')).toBeDefined();
    expect(toIsoTimestamp('29.02.2025', '10:00')).toBeUndefined();
  });

  it('weist eine unmögliche Uhrzeit ab', () => {
    expect(toIsoTimestamp('04.06.2025', '25:70')).toBeUndefined();
  });
});

describe('parseFahrtenbuchPdf', () => {
  it('liest Fahrzeug und Kennzeichen aus dem Titel', () => {
    const result = parseFahrtenbuchPdf([page(...filler(20))]);
    expect(result.vehicleName).toBe('KDTFA');
    expect(result.kennzeichen).toBe('FW-205ND');
  });

  it('liest eine gewöhnliche Zeile vollständig', () => {
    const result = parseFahrtenbuchPdf([page(...filler(20))]);
    expect(result.rows[0]).toMatchObject({
      datum: '04.06.2025',
      von: '17:40',
      bis: '18:00',
      fahrer: 'Anna Muster',
      grund: 'Sonstiges',
      zweckStrecke: 'Besorgung',
      startKm: 14600,
      endeKm: 14610,
      gefahreneKm: 10,
      problem: undefined,
    });
  });

  it('repariert die verklebte Zelle und meldet kein Problem', () => {
    const result = parseFahrtenbuchPdf([page(...filler(50), OVERFLOW_ROW)]);
    const repaired = result.rows.find((r) => r.datum === '11.09.2025');
    expect(repaired).toMatchObject({
      zweckStrecke: 'Eigener Einsatzbereich - T1 Verkehrswege freimachen',
      startKm: 15134,
      endeKm: 15142,
      gefahreneKm: 8,
      problem: undefined,
    });
  });

  it('meldet eine nicht aufgehende Differenz', () => {
    const wrong = row(100, [
      '12.09.2025',
      '08:00 - 09:00',
      'Bea Beispiel',
      'Einsatz',
      'BMA',
      '15,000',
      '15,010',
      '99',
      '-',
      '-',
      '',
    ]);
    const result = parseFahrtenbuchPdf([page(...filler(20), wrong)]);
    expect(result.rows.find((r) => r.datum === '12.09.2025')?.problem).toBe(
      'kmMismatch',
    );
  });

  it('liest Treibstoff und AdBlue mit Dezimalkomma', () => {
    const fuel = row(100, [
      '14.03.2026',
      '10:00 - 12:00',
      'Bea Beispiel',
      'Sonstiges',
      'Signal 112',
      '16,490',
      '16,753',
      '263',
      '39,40',
      '8,70',
      'Nachtanken',
    ]);
    const result = parseFahrtenbuchPdf([page(...filler(20), fuel)]);
    expect(result.rows.find((r) => r.datum === '14.03.2026')).toMatchObject({
      treibstoff: 39.4,
      adBlue: 8.7,
      notizen: 'Nachtanken',
    });
  });

  it('führt mehrere Seiten mit wiederholter Kopfzeile zusammen', () => {
    const result = parseFahrtenbuchPdf([
      page(...filler(20)),
      page(...filler(15)),
    ]);
    expect(result.rows).toHaveLength(35);
    expect(result.rows.map((r) => r.line)).toEqual(
      Array.from({ length: 35 }, (_, i) => i + 1),
    );
  });

  it('lehnt eine Datei ohne Kopfzeile ab', () => {
    const result = parseFahrtenbuchPdf([[item('Irgendein Text', 40, 700)]]);
    expect(result.error).toBe('unknownFormat');
  });

  it('meldet eine leere Datei', () => {
    expect(parseFahrtenbuchPdf([[]]).error).toBe('empty');
  });

  it('meldet einen fehlenden Kilometerstand', () => {
    const missing = row(100, [
      '13.09.2025',
      '08:00 - 09:00',
      'Bea Beispiel',
      'Einsatz',
      'BMA',
      '',
      '',
      '',
      '-',
      '-',
      '',
    ]);
    const result = parseFahrtenbuchPdf([page(...filler(20), missing)]);
    expect(result.rows.find((r) => r.datum === '13.09.2025')?.problem).toBe(
      'kmMissing',
    );
  });

  it('meldet eine fehlende Uhrzeit', () => {
    const missing = row(100, [
      '14.09.2025',
      '',
      'Bea Beispiel',
      'Einsatz',
      'BMA',
      '15,000',
      '15,010',
      '10',
      '-',
      '-',
      '',
    ]);
    const result = parseFahrtenbuchPdf([page(...filler(20), missing)]);
    expect(result.rows.find((r) => r.datum === '14.09.2025')?.problem).toBe(
      'timeMissing',
    );
  });

  it('meldet ein unmögliches Datum, statt es weiterzurollen', () => {
    const impossible = row(100, [
      '31.02.2025',
      '08:00 - 09:00',
      'Bea Beispiel',
      'Einsatz',
      'BMA',
      '15,000',
      '15,010',
      '10',
      '-',
      '-',
      '',
    ]);
    const result = parseFahrtenbuchPdf([page(...filler(20), impossible)]);
    const parsed = result.rows.find((r) => r.datum === '31.02.2025');
    // Die Zeile darf nicht als 03.03.2025 durchgehen.
    expect(parsed?.problem).toBe('dateInvalid');
  });

  it('liest eine Tankmenge mit drei Nachkommastellen als Dezimalzahl', () => {
    // Ohne die getrennte Regel für die Betriebsmittelspalten fiele `1,234`
    // auf die Ganzzahl zurück und würde zu 1234 Litern.
    const fuel = row(100, [
      '15.09.2025',
      '08:00 - 09:00',
      'Bea Beispiel',
      'Sonstiges',
      'Tanken',
      '15,000',
      '15,010',
      '10',
      '1,234',
      '-',
      '',
    ]);
    const result = parseFahrtenbuchPdf([page(...filler(20), fuel)]);
    expect(result.rows.find((r) => r.datum === '15.09.2025')?.treibstoff).toBe(
      1.234,
    );
  });
});
