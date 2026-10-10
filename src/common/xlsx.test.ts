import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  columnIndex,
  excelSerialToIsoDate,
  listXlsxSheets,
  readXlsxSheet,
  readXlsxSheetByName,
} from './xlsx';

/** Baut eine XLSX-Datei mit einem Blatt aus rohem SpreadsheetML. */
function xlsx(sheetXml: string, sharedStringsXml?: string): Uint8Array {
  const files: Record<string, Uint8Array> = {
    'xl/worksheets/sheet1.xml': strToU8(
      `<?xml version="1.0"?><worksheet><sheetData>${sheetXml}</sheetData></worksheet>`,
    ),
  };
  if (sharedStringsXml) {
    files['xl/sharedStrings.xml'] = strToU8(
      `<?xml version="1.0"?><sst>${sharedStringsXml}</sst>`,
    );
  }
  return zipSync(files);
}

interface WorkbookSheet {
  name: string;
  /** Dateinummer, z. B. 3 für `xl/worksheets/sheet3.xml`. */
  file: number;
  sheetXml: string;
}

/**
 * Baut eine XLSX-Datei mit mehreren Blättern samt `xl/workbook.xml` und
 * Relationships. Die Dateinummern dürfen von der Blattreihenfolge abweichen —
 * so wie in echten Dateien, in denen Blätter verschoben wurden.
 */
function xlsxWorkbook(
  sheets: WorkbookSheet[],
  options: { absoluteTargets?: boolean; sharedStringsXml?: string } = {},
): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const sheetEntries: string[] = [];
  const rels: string[] = [];
  sheets.forEach((sheet, i) => {
    files[`xl/worksheets/sheet${sheet.file}.xml`] = strToU8(
      `<?xml version="1.0"?><worksheet><sheetData>${sheet.sheetXml}</sheetData></worksheet>`,
    );
    const rid = `rId${i + 10}`;
    sheetEntries.push(
      `<sheet name="${sheet.name}" sheetId="${i + 1}" r:id="${rid}"/>`,
    );
    const target = options.absoluteTargets
      ? `/xl/worksheets/sheet${sheet.file}.xml`
      : `worksheets/sheet${sheet.file}.xml`;
    rels.push(
      `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="${target}"/>`,
    );
  });
  rels.push(
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
  );
  files['xl/workbook.xml'] = strToU8(
    `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetEntries.join('')}</sheets></workbook>`,
  );
  files['xl/_rels/workbook.xml.rels'] = strToU8(
    `<?xml version="1.0"?><Relationships>${rels.join('')}</Relationships>`,
  );
  if (options.sharedStringsXml) {
    files['xl/sharedStrings.xml'] = strToU8(
      `<?xml version="1.0"?><sst>${options.sharedStringsXml}</sst>`,
    );
  }
  return zipSync(files);
}

const cell = (ref: string, text: string) =>
  `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;

describe('listXlsxSheets', () => {
  it('liefert die Blätter in Reihenfolge mit der Dateinummer aus den Relationships', () => {
    const data = xlsxWorkbook([
      { name: 'Übersicht', file: 2, sheetXml: '' },
      { name: 'Bestandsliste Einsatzbekleidung', file: 5, sheetXml: '' },
      { name: 'Bestandsliste Dienstbekleidung', file: 1, sheetXml: '' },
    ]);
    expect(listXlsxSheets(data)).toEqual([
      { name: 'Übersicht', index: 2 },
      { name: 'Bestandsliste Einsatzbekleidung', index: 5 },
      { name: 'Bestandsliste Dienstbekleidung', index: 1 },
    ]);
  });

  it('versteht absolute Ziele in den Relationships', () => {
    const data = xlsxWorkbook(
      [{ name: 'A', file: 3, sheetXml: '' }],
      { absoluteTargets: true },
    );
    expect(listXlsxSheets(data)).toEqual([{ name: 'A', index: 3 }]);
  });

  it('entschlüsselt XML-Entities im Blattnamen', () => {
    const data = xlsxWorkbook([{ name: 'Lager &amp; Ausgabe', file: 1, sheetXml: '' }]);
    expect(listXlsxSheets(data)[0].name).toBe('Lager & Ausgabe');
  });

  it('wirft ohne workbook.xml', () => {
    const data = xlsx(`<row r="1"><c r="A1"><v>1</v></c></row>`);
    expect(() => listXlsxSheets(data)).toThrow(/workbook\.xml/);
  });
});

describe('readXlsxSheetByName', () => {
  const data = xlsxWorkbook(
    [
      { name: 'Erstes', file: 2, sheetXml: `<row r="1">${cell('A1', 'eins')}</row>` },
      {
        name: 'Zweites',
        file: 1,
        sheetXml: `<row r="1"><c r="A1" t="s"><v>0</v></c>${cell('B1', 'zwei')}</row>`,
      },
    ],
    { sharedStringsXml: '<si><t>geteilt</t></si>' },
  );

  it('liest das Blatt über seinen Namen, nicht über die Position', () => {
    expect(readXlsxSheetByName(data, 'Erstes')).toEqual([['eins']]);
    expect(readXlsxSheetByName(data, 'Zweites')).toEqual([['geteilt', 'zwei']]);
  });

  it('wirft bei unbekanntem Blattnamen', () => {
    expect(() => readXlsxSheetByName(data, 'Fehlt')).toThrow(
      'xlsx: Blatt "Fehlt" nicht gefunden',
    );
  });

  it('beachtet die Größengrenze', () => {
    const big = xlsxWorkbook([
      {
        name: 'Groß',
        file: 1,
        sheetXml: `<row r="1">${cell('A1', 'x'.repeat(4096))}</row>`,
      },
    ]);
    expect(() => readXlsxSheetByName(big, 'Groß', 1024)).toThrow(/zu groß/);
  });
});

describe('excelSerialToIsoDate', () => {
  it('wandelt Seriennummern in ISO-Daten', () => {
    expect(excelSerialToIsoDate('45250')).toBe('2023-11-20');
    expect(excelSerialToIsoDate('44378')).toBe('2021-07-01');
    expect(excelSerialToIsoDate(' 44378.0 ')).toBe('2021-07-01');
    // Uhrzeitanteil wird abgeschnitten
    expect(excelSerialToIsoDate('45250.75')).toBe('2023-11-20');
  });

  it('liefert undefined für Text und leere Werte', () => {
    expect(excelSerialToIsoDate('nicht bekannt')).toBeUndefined();
    expect(excelSerialToIsoDate('')).toBeUndefined();
    expect(excelSerialToIsoDate('0')).toBeUndefined();
    expect(excelSerialToIsoDate('-5')).toBeUndefined();
  });
});

describe('columnIndex', () => {
  it('rechnet Spaltenbuchstaben in einen Nullindex um', () => {
    expect(columnIndex('A1')).toBe(0);
    expect(columnIndex('Z9')).toBe(25);
    expect(columnIndex('AA1')).toBe(26);
    expect(columnIndex('AF12')).toBe(31);
  });
});

describe('readXlsxSheet', () => {
  it('lehnt einen zu großen Teil ab (Zip-Bombe)', () => {
    const data = xlsx(
      `<row r="1"><c r="A1" t="inlineStr"><is><t>${'x'.repeat(4096)}</t></is></c></row>`,
    );
    expect(() => readXlsxSheet(data, 1, 1024)).toThrow(/zu groß/);
    expect(readXlsxSheet(data, 1, 64 * 1024)[0][0]).toHaveLength(4096);
  });

  it('entpackt nur Blatt und sharedStrings, andere Teile bleiben unberührt', () => {
    const data = zipSync({
      'xl/worksheets/sheet1.xml': strToU8(
        '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>ID</t></is></c></row></sheetData></worksheet>',
      ),
      // Ein riesiger Anhang, der nicht gebraucht wird, zählt nicht gegen die Grenze.
      'xl/media/image1.png': new Uint8Array(1024 * 1024),
    });
    expect(readXlsxSheet(data, 1, 64 * 1024)).toEqual([['ID']]);
  });

  it('löst Verweise in die sharedStrings-Tabelle auf', () => {
    const data = xlsx(
      `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>`,
      `<si><t>ID</t></si><si><t>Bezeichnung</t></si>`,
    );
    expect(readXlsxSheet(data)).toEqual([['ID', 'Bezeichnung']]);
  });

  it('setzt mehrteilige sharedStrings zusammen', () => {
    // Formatierte Zellen zerfallen in mehrere <t>; sie gehören zu einer
    // Zeichenkette zusammen, sonst fehlt die halbe Bezeichnung.
    const data = xlsx(
      `<row r="1"><c r="A1" t="s"><v>0</v></c></row>`,
      `<si><r><t>Atemluftflasche </t></r><r><t>CFK 6,8 l</t></r></si>`,
    );
    expect(readXlsxSheet(data)[0][0]).toBe('Atemluftflasche CFK 6,8 l');
  });

  it('füllt übersprungene Spalten mit leeren Strings', () => {
    // Eine leere Zelle steht gar nicht in der Datei. Ohne Auffüllen rutschte
    // "Atemschutz" aus Spalte F nach Spalte E — und der ganze Import wäre um
    // eine Spalte verschoben.
    const data = xlsx(
      `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="F1" t="s"><v>1</v></c></row>`,
      `<si><t>ID</t></si><si><t>Atemschutz</t></si>`,
    );
    expect(readXlsxSheet(data)[0]).toEqual([
      'ID',
      '',
      '',
      '',
      '',
      'Atemschutz',
    ]);
  });

  it('füllt kürzere Zeilen auf die Breite der längsten auf', () => {
    const data = xlsx(
      `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>` +
        `<row r="2"><c r="A2" t="s"><v>2</v></c></row>`,
      `<si><t>ID</t></si><si><t>Nr</t></si><si><t>96176</t></si>`,
    );
    expect(readXlsxSheet(data)).toEqual([
      ['ID', '', 'Nr'],
      ['96176', '', ''],
    ]);
  });

  it('überspringt selbstschließende leere Zellen, ohne die Zeile zu verschieben', () => {
    // Der echte Artikelexport schreibt leere Zellen als `<c r="D2" s="2"/>`.
    // Ein Muster, das `[^>]*` auch über den Schrägstrich laufen lässt, liest
    // ein solches Tag als Beginn einer gefüllten Zelle und verschluckt alles
    // bis zum nächsten `</c>` — die Seriennummer landete dadurch unter
    // "Bemerkung".
    const data = xlsx(
      `<row r="1">` +
        `<c r="A1" t="s"><v>0</v></c>` +
        `<c r="B1" s="2"/>` +
        `<c r="C1" s="2"/>` +
        `<c r="D1" t="s"><v>1</v></c>` +
        `<c r="E1"><v>2023</v></c>` +
        `</row>`,
      `<si><t>96176</t></si><si><t>Neusiedl am See</t></si>`,
    );
    expect(readXlsxSheet(data)[0]).toEqual([
      '96176',
      '',
      '',
      'Neusiedl am See',
      '2023',
    ]);
  });

  it('behandelt ein selbstschließendes <t/> als leeren Text', () => {
    const data = xlsx(
      `<row r="1"><c r="A1" t="s"><v>0</v></c></row>`,
      `<si><t/></si>`,
    );
    expect(readXlsxSheet(data)[0][0]).toBe('');
  });

  it('liest Zahlen als String, wie sie in der Datei stehen', () => {
    // Die fachliche Auslegung (45250 ist ein Datum) gehört nicht hierher.
    const data = xlsx(`<row r="1"><c r="A1"><v>45250</v></c></row>`);
    expect(readXlsxSheet(data)[0][0]).toBe('45250');
  });

  it('liest Inline-Zeichenketten', () => {
    const data = xlsx(
      `<row r="1"><c r="A1" t="inlineStr"><is><t>Neusiedl am See</t></is></c></row>`,
    );
    expect(readXlsxSheet(data)[0][0]).toBe('Neusiedl am See');
  });

  it('entschlüsselt XML-Entities genau einmal', () => {
    // `&amp;lt;` ist im Klartext die Zeichenfolge "&lt;", nicht "<". Würde
    // `&amp;` zuerst ersetzt, liefe der Wert durch eine zweite Runde und käme
    // als "<" heraus — deshalb steht `&amp;` in decodeXml zuletzt.
    const data = xlsx(
      `<row r="1"><c r="A1" t="s"><v>0</v></c></row>`,
      `<si><t>Schl&amp;auml; &lt;Test&gt; &amp;amp; mehr</t></si>`,
    );
    expect(readXlsxSheet(data)[0][0]).toBe('Schl&auml; <Test> &amp; mehr');
  });

  it('kommt ohne sharedStrings-Tabelle aus', () => {
    const data = xlsx(`<row r="1"><c r="A1"><v>7</v></c></row>`);
    expect(readXlsxSheet(data)[0][0]).toBe('7');
  });

  it('wirft, wenn das angeforderte Blatt fehlt', () => {
    const data = xlsx(`<row r="1"><c r="A1"><v>1</v></c></row>`);
    expect(() => readXlsxSheet(data, 3)).toThrow(/sheet3\.xml/);
  });

  it('wirft bei einer Datei, die kein Zip ist', () => {
    expect(() => readXlsxSheet(new Uint8Array([1, 2, 3]))).toThrow();
  });
});
