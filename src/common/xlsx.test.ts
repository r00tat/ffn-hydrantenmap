import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { columnIndex, readXlsxSheet } from './xlsx';

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

describe('columnIndex', () => {
  it('rechnet Spaltenbuchstaben in einen Nullindex um', () => {
    expect(columnIndex('A1')).toBe(0);
    expect(columnIndex('Z9')).toBe(25);
    expect(columnIndex('AA1')).toBe(26);
    expect(columnIndex('AF12')).toBe(31);
  });
});

describe('readXlsxSheet', () => {
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
