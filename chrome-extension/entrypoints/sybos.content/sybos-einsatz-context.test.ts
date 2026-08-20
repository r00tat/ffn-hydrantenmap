import { describe, it, expect } from 'vitest';
import { readSybosEinsatzContext } from './sybos-einsatz-context';

function makeDoc(bodyHtml: string): Document {
  return new DOMParser().parseFromString(
    `<html><body>${bodyHtml}</body></html>`,
    'text/html'
  );
}

/**
 * The SYBOS Einsatz detail form as PAT renders it: a table whose left cell
 * carries the label text and whose right cell carries the control.
 */
function tableForm(rows: [string, string][]): Document {
  const cells = rows
    .map(([label, control]) => `<tr><td>${label}</td><td>${control}</td></tr>`)
    .join('');
  return makeDoc(`<form name="frmEinsatzAdd"><table>${cells}</table></form>`);
}

describe('readSybosEinsatzContext', () => {
  it('returns null when the page carries no einsatz fields', () => {
    const doc = makeDoc('<div>Startseite</div>');
    expect(readSybosEinsatzContext(doc)).toBeNull();
  });

  it('reads date and time from separate labeled fields', () => {
    const doc = tableForm([
      ['Datum', '<input name="EINSATZ_ESdat" value="02.05.2026">'],
      ['Beginn', '<input name="EINSATZ_ESbeg" value="10:15">'],
    ]);
    const ctx = readSybosEinsatzContext(doc)!;
    expect(ctx.start).not.toBeNull();
    expect(ctx.start!.getFullYear()).toBe(2026);
    expect(ctx.start!.getMonth()).toBe(4);
    expect(ctx.start!.getDate()).toBe(2);
    expect(ctx.start!.getHours()).toBe(10);
    expect(ctx.start!.getMinutes()).toBe(15);
  });

  it('reads a combined date+time field', () => {
    const doc = tableForm([
      ['Einsatzbeginn', '<input name="EINSATZ_ESbeg" value="02.05.2026 10:15">'],
    ]);
    const ctx = readSybosEinsatzContext(doc)!;
    expect(ctx.start!.getHours()).toBe(10);
    expect(ctx.start!.getDate()).toBe(2);
  });

  it('falls back to midnight when only a date is given', () => {
    const doc = tableForm([
      ['Datum', '<input name="EINSATZ_ESdat" value="02.05.2026">'],
    ]);
    const ctx = readSybosEinsatzContext(doc)!;
    expect(ctx.start!.getHours()).toBe(0);
    expect(ctx.dateOnly).toBe(true);
  });

  it('reads title, einsatzart and ort', () => {
    const doc = tableForm([
      ['Einsatzstichwort', '<input name="EINSATZ_ESbez" value="B1 Kaminbrand">'],
      [
        'Einsatzart',
        '<select name="EINSATZART_EAnr">' +
          '<option value="">bitte wählen</option>' +
          '<option value="3" selected>Brandeinsatz</option>' +
          '</select>',
      ],
      ['Einsatzort', '<input name="EINSATZ_ESort" value="Hauptstraße 12">'],
    ]);
    const ctx = readSybosEinsatzContext(doc)!;
    expect(ctx.title).toBe('B1 Kaminbrand');
    expect(ctx.einsatzart).toBe('Brandeinsatz');
    expect(ctx.ort).toBe('Hauptstraße 12');
  });

  it('ignores a select that still sits on its placeholder option', () => {
    const doc = tableForm([
      ['Einsatzstichwort', '<input name="EINSATZ_ESbez" value="B1 Kaminbrand">'],
      [
        'Einsatzart',
        '<select name="EINSATZART_EAnr">' +
          '<option value="" selected>-- bitte wählen --</option>' +
          '<option value="3">Brandeinsatz</option>' +
          '</select>',
      ],
    ]);
    const ctx = readSybosEinsatzContext(doc)!;
    expect(ctx.einsatzart).toBeNull();
  });

  it('reads fields labeled via <label for>', () => {
    const doc = makeDoc(
      '<form name="frmEinsatzAdd">' +
        '<label for="f1">Einsatzstichwort</label>' +
        '<input id="f1" name="whatever" value="T1 Ölspur">' +
        '</form>'
    );
    const ctx = readSybosEinsatzContext(doc)!;
    expect(ctx.title).toBe('T1 Ölspur');
  });

  it('picks up the einsatz id when the page exposes one', () => {
    const doc = tableForm([
      ['Datum', '<input name="EINSATZ_ESdat" value="02.05.2026">'],
      ['Nummer', '<input type="hidden" name="EINSATZ_ESnr" value="98765">'],
    ]);
    expect(readSybosEinsatzContext(doc)!.einsatzId).toBe('98765');
  });

  it('ignores empty fields', () => {
    const doc = tableForm([
      ['Einsatzstichwort', '<input name="EINSATZ_ESbez" value="  ">'],
      ['Einsatzort', '<input name="EINSATZ_ESort" value="Hauptstraße 12">'],
    ]);
    const ctx = readSybosEinsatzContext(doc)!;
    expect(ctx.title).toBeNull();
    expect(ctx.ort).toBe('Hauptstraße 12');
  });

  it('ignores an unparsable date instead of guessing', () => {
    const doc = tableForm([
      ['Datum', '<input name="EINSATZ_ESdat" value="tt.mm.jjjj">'],
      ['Einsatzort', '<input name="EINSATZ_ESort" value="Hauptstraße 12">'],
    ]);
    const ctx = readSybosEinsatzContext(doc)!;
    expect(ctx.start).toBeNull();
  });

  it('does not mistake "Ortsfeuerwehr" for the einsatz address', () => {
    const doc = tableForm([
      ['Ortsfeuerwehr', '<input name="FW_FWnr" value="Neusiedl am See">'],
      ['Einsatzstichwort', '<input name="EINSATZ_ESbez" value="B1 Kaminbrand">'],
    ]);
    const ctx = readSybosEinsatzContext(doc)!;
    expect(ctx.ort).toBeNull();
  });
});
