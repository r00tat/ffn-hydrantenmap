import { describe, expect, it } from 'vitest';
import { parseSybosMaterialLines } from './sybos-material-table';

function makeDoc(bodyHtml: string): Document {
  return new DOMParser().parseFromString(
    `<html><body>${bodyHtml}</body></html>`,
    'text/html'
  );
}

describe('parseSybosMaterialLines', () => {
  it('findet je Anzahl-Feld eine Zeile mit Schlüssel und Feldnamen', () => {
    const doc = makeDoc(
      '<form name="frmMain">' +
        '<input type="text" name="WAESanzahl[2004]" value="1">' +
        '<input type="text" name="WAESanzahl[46143]" value="99">' +
        '<input type="hidden" name="amount_123" value="1">' +
        '</form>'
    );

    const lines = parseSybosMaterialLines(doc);

    expect(lines.map((l) => l.key)).toEqual(['2004', '46143']);
    expect(lines[0]?.field).toBe('WAESanzahl[2004]');
  });

  it('liest den Gerätenamen aus dem name_tbl-Feld der Zeile', () => {
    const doc = makeDoc(
      '<form name="frmMain">' +
        '<input type="hidden" name="name_tbl[deleted[2004]]" value="RLFA-2000">' +
        '<input type="text" name="WAESanzahl[2004]" value="1">' +
        '</form>'
    );

    expect(parseSybosMaterialLines(doc)[0]?.names).toContain('RLFA-2000');
  });

  it('ignoriert den Platzhalter {GEbez} als Namen', () => {
    const doc = makeDoc(
      '<form name="frmMain">' +
        '<input type="hidden" name="name_tbl[deleted[2004]]" value="{GEbez}">' +
        '<input type="text" name="WAESanzahl[2004]" value="1">' +
        '</form>'
    );

    expect(parseSybosMaterialLines(doc)[0]?.names).toEqual([]);
  });

  it('liest den Namen aus einem WAname-Feld derselben Zeile', () => {
    const doc = makeDoc(
      '<form name="frmMain"><table><tbody><tr>' +
        '<td><input type="hidden" name="WAname[2004]" value="WLF-K Neusiedl am See"></td>' +
        '<td><input type="text" name="WAESanzahl[2004]" value="1"></td>' +
        '</tr></tbody></table></form>'
    );

    expect(parseSybosMaterialLines(doc)[0]?.names).toContain(
      'WLF-K Neusiedl am See'
    );
  });

  it('nimmt die Zellentexte der Zeile als weitere Kandidaten', () => {
    const doc = makeDoc(
      '<form name="frmMain"><table><tbody><tr>' +
        '<td>KDTFA</td>' +
        '<td>Kommandofahrzeug</td>' +
        '<td><input type="text" name="WAESanzahl[2004]" value="1"></td>' +
        '</tr></tbody></table></form>'
    );

    const names = parseSybosMaterialLines(doc)[0]?.names ?? [];
    expect(names).toContain('KDTFA');
    expect(names).toContain('Kommandofahrzeug');
  });

  it('hält die Zeilen auseinander — Kandidaten der Nachbarzeile zählen nicht', () => {
    const doc = makeDoc(
      '<form name="frmMain"><table><tbody>' +
        '<tr><td>KDTFA</td><td><input type="text" name="WAESanzahl[1]" value="1"></td></tr>' +
        '<tr><td>RLFA-2000</td><td><input type="text" name="WAESanzahl[2]" value="1"></td></tr>' +
        '</tbody></table></form>'
    );

    const lines = parseSybosMaterialLines(doc);
    expect(lines[0]?.names).toContain('KDTFA');
    expect(lines[0]?.names).not.toContain('RLFA-2000');
    expect(lines[1]?.names).toContain('RLFA-2000');
  });

  it('stellt den verlässlichsten Kandidaten voran', () => {
    const doc = makeDoc(
      '<form name="frmMain"><table><tbody><tr>' +
        '<td>Zeilentext</td>' +
        '<td><input type="hidden" name="name_tbl[deleted[2004]]" value="RLFA-2000"></td>' +
        '<td><input type="text" name="WAESanzahl[2004]" value="1"></td>' +
        '</tr></tbody></table></form>'
    );

    expect(parseSybosMaterialLines(doc)[0]?.names[0]).toBe('RLFA-2000');
  });

  it('liefert keine Zeilen, wenn es kein Anzahl-Feld gibt', () => {
    const doc = makeDoc('<form name="frmMain"><input name="foo" value="1"></form>');
    expect(parseSybosMaterialLines(doc)).toEqual([]);
  });
});
