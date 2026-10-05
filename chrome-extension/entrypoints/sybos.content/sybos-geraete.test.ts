import { describe, it, expect } from 'vitest';
import {
  buildGeraeteAssignmentParams,
  buildGeraeteFilterParams,
  buildGeraeteSelectionParams,
  parseListRange,
  sybosAnzahl,
} from './sybos-geraete';
import type { SybosGeraetLine } from '@shared/types';

function makeDoc(bodyHtml: string): Document {
  return new DOMParser().parseFromString(
    `<html><body>${bodyHtml}</body></html>`,
    'text/html'
  );
}

/** A frmGeraetSelect row as it arrives fetched: the `myData` array only. */
function selectionRow(id: string, waname: string): unknown[] {
  const html =
    `<input name='BListMulti[]' value='${id}' type='hidden'/>` +
    `<input name='deleted[${id}]' id='selected_tbl[]' value='${id}' type='checkbox' class='checkbox' />` +
    `<input type='hidden' name='name_tbl[${id}]' value='${id}'>` +
    `<input type='hidden' name='id_tbl[${id}]' value='${id}'>` +
    `<input type='hidden' name='name_tbl[deleted[${id}]]' value='{GEbez}'>`;
  return [html, waname, 'Ort', '', 'Klasse', 'Untertyp', '', ''];
}

function selectionDoc(
  rows: { id: string; waname: string }[],
  { filter = 'fuhrp', range = '' }: { filter?: string; range?: string } = {}
): Document {
  const script = `var myData = ${JSON.stringify(rows.map((r) => selectionRow(r.id, r.waname)))};`;
  const options = ['fuhrp', 'gerae', 'cont', 'atems']
    .map((v) => `<option value="${v}"${v === filter ? ' selected' : ''}>${v}</option>`)
    .join('');
  return makeDoc(
    `<form name="frmMain">` +
      `<input type="hidden" name="patFormCheckID" value="x~y">` +
      `<input type="hidden" name="BListFrom" value="">` +
      `<select name="frmListeListSelect" onchange="document.frmMain.submit()">${options}</select>` +
      `<span>${range}</span>` +
      `<script>${script}</script></form>`
  );
}

function editDoc(lines: { key: string; name?: string }[]): Document {
  const rows = lines
    .map(
      (line) =>
        `<tr><td>${line.name ?? ''}</td>` +
        `<td><input type="text" name="WAESanzahl[${line.key}]" value="1"></td></tr>`
    )
    .join('');
  return makeDoc(
    `<form name="frmMain"><input type="hidden" name="amount_1" value="1"><table><tbody>${rows}</tbody></table></form>`
  );
}

const binder: SybosGeraetLine = {
  sybosId: '78512',
  name: 'Prüfröhrchen Chlor',
  typ: 'gerae',
  anzahl: 3,
  einheit: 'stk',
};
const pumpe: SybosGeraetLine = {
  sybosId: '90347',
  name: 'Tauchpumpe',
  typ: 'gerae',
  anzahl: 2.5,
  einheit: 'h',
};
const ohneAnzahl: SybosGeraetLine = { sybosId: '29218', name: 'Kompressor', typ: 'gerae' };

describe('buildGeraeteFilterParams', () => {
  it('stellt die Liste auf den Typ um, ohne zu speichern', () => {
    const params = buildGeraeteFilterParams(selectionDoc([]), 'gerae');

    expect(params?.get('frmListeListSelect')).toBe('gerae');
    expect(params?.get('patFormCheckID')).toBe('x~y');
    expect(params?.has('action_save')).toBe(false);
  });

  it('liefert null, wenn die Liste schon den Typ zeigt', () => {
    expect(buildGeraeteFilterParams(selectionDoc([], { filter: 'gerae' }), 'gerae')).toBeNull();
  });

  it('liefert null, wenn es den Filter oder den Typ nicht gibt', () => {
    expect(buildGeraeteFilterParams(makeDoc('<form name="frmMain"></form>'), 'gerae')).toBeNull();
    expect(buildGeraeteFilterParams(selectionDoc([]), 'xyz' as 'gerae')).toBeNull();
  });
});

describe('parseListRange', () => {
  it('liest „(1 - 50 von 1099)"', () => {
    expect(parseListRange(selectionDoc([], { range: 'Geräte (1 - 50 von 1099)' }))).toEqual({
      from: 1,
      to: 50,
      total: 1099,
    });
  });

  it('liefert null ohne Angabe', () => {
    expect(parseListRange(selectionDoc([]))).toBeNull();
  });
});

describe('buildGeraeteSelectionParams', () => {
  it('hakt Artikel über die Sybos-ID an, nicht über den Namen', () => {
    const doc = selectionDoc(
      [
        { id: '78512', waname: 'Anders benannt' },
        { id: '11111', waname: 'Tauchpumpe' },
      ],
      { filter: 'gerae' }
    );

    const { params, matched, notFound } = buildGeraeteSelectionParams(doc, [binder, pumpe]);

    expect(params.getAll('deleted[78512]')).toEqual(['78512']);
    expect(params.has('deleted[11111]')).toBe(false);
    // Die versteckten Felder aller Zeilen gehen mit, wie beim Browser.
    expect(params.getAll('BListMulti[]')).toEqual(['78512', '11111']);
    expect(params.get('action_save')).toBe('action_save');
    expect(matched).toEqual(['Prüfröhrchen Chlor']);
    expect(notFound).toEqual(['Tauchpumpe']);
  });
});

describe('sybosAnzahl', () => {
  it('rundet auf ganze Zahlen, mindestens 1', () => {
    expect(sybosAnzahl(3)).toBe(3);
    expect(sybosAnzahl(2.5)).toBe(3);
    expect(sybosAnzahl(0.25)).toBe(1);
    expect(sybosAnzahl(0)).toBe(0);
  });
});

describe('buildGeraeteAssignmentParams', () => {
  it('trägt je Zeile die Anzahl des Artikels mit derselben Sybos-ID ein', () => {
    const doc = editDoc([
      { key: '78512', name: 'Prüfröhrchen Chlor' },
      { key: '90347', name: 'Tauchpumpe' },
      { key: '29218', name: 'Kompressor' },
      { key: '57738', name: 'KDTFA' },
    ]);

    const { params, amounts } = buildGeraeteAssignmentParams(doc, [binder, pumpe, ohneAnzahl]);

    expect(params.get('WAESanzahl[78512]')).toBe('3');
    expect(params.get('WAESanzahl[90347]')).toBe('3');
    // Ohne Anzahl bleibt der Wert, den SYBOS vorbelegt.
    expect(params.get('WAESanzahl[29218]')).toBe('1');
    // Fremde Zeilen (Fahrzeuge) bleiben unberührt.
    expect(params.get('WAESanzahl[57738]')).toBe('1');
    expect(params.get('amount_1')).toBe('1');
    expect(params.get('action_next')).toBe('action_next');
    expect(params.get('patMultipleChoice')).toBe('true');
    expect(amounts).toEqual([
      { label: 'Prüfröhrchen Chlor', anzahl: 3, einheit: 'stk' },
      { label: 'Tauchpumpe', anzahl: 3, einheit: 'h', gerundet: 2.5 },
      { label: 'Kompressor', missing: 'noAmount' },
    ]);
  });
});
