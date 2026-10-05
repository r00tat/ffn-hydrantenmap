import { describe, it, expect } from 'vitest';
import {
  buildGeraeteAssignmentParams,
  buildGeraeteSelectionParams,
  buildListPageParams,
  groupByListType,
  listTypeFor,
  parseListRange,
  parseListTypes,
  sybosAnzahl,
} from './sybos-geraete';
import type { SybosGeraetLine } from '@shared/types';

function makeDoc(bodyHtml: string): Document {
  return new DOMParser().parseFromString(
    `<html><body>${bodyHtml}</body></html>`,
    'text/html'
  );
}

/** A frmGeraetSelect row as it arrives fetched (captures/add-geraete-2.har). */
function selectionRow(id: string, waname: string): unknown[] {
  const html =
    `<input name='BListMulti[]' value='${id}' type='hidden'/>` +
    `<input name='deleted[${id}]' id='selected_tbl[]' value='${id}' type='checkbox' class='checkbox' />` +
    `<input type='hidden' name='name_tbl[${id}]' value='${id}'>` +
    `<input type='hidden' name='id_tbl[${id}]' value='${id}'>` +
    `<input type='hidden' name='name_tbl[deleted[${id}]]' value='{GEbez}'>`;
  return [html, waname, 'Neusiedl am See', '', 'Feuerwehrhaus', 'Diverses', '', '', id];
}

const LIST_TYPES = [
  ['atems', 'Atemschutz'],
  ['bekle', 'Bekleidung'],
  ['cont', 'Container'],
  ['fuhrp', 'Fahrzeug'],
  ['gerae', 'Gerät'],
];

/** The popup as SYBOS renders it: unnamed select, hidden field with the value. */
function popupDoc(
  rows: { id: string; waname: string }[],
  { list = 'gerae', range = '' }: { list?: string; range?: string } = {}
): Document {
  const script = `var myData = ${JSON.stringify(rows.map((r) => selectionRow(r.id, r.waname)))};`;
  const options = LIST_TYPES.map(
    ([code, label]) => `<option value="${code}"${code === list ? ' selected="selected"' : ''}> ${label}</option>`
  ).join('');
  return makeDoc(
    `<form method="post" name="frmMain" action="&amp;patJustContent=1">` +
      `<input type="hidden" name="patFormCheckID" value="x~y">` +
      `<input type="hidden" name="BListFrom" value="">` +
      `<input id="frmListeListAnf" name="frmListeListAnf" type="text" value="alt">` +
      `<select id="frmListeListSelect" size="1">${options}</select>` +
      `<input type="hidden" name="frmListeListSelect" id="hidTab2_frmListeListSelect" value="${list}">` +
      `<select name="LstWAG1WAGnr"><option value="0">-</option><option selected value="724">Schadstoff</option></select>` +
      `<select name="LstWAG2WAGnr"><option selected value="0">-</option></select>` +
      `<input id="filter" name="filter" checked="checked" type="checkbox" value="1">` +
      `<input type="hidden" id="patAction" name="patAction" value="">` +
      `<td class="listViewPaginationTdS1">Material - Neusiedl am See ${range}</td>` +
      `<script>${script}</script></form>`
  );
}

function editDoc(lines: { key: string; name?: string }[]): Document {
  const rows = lines
    .map(
      (line) =>
        `<tr><td><input type="text" name="Geraet" value="${line.name ?? ''}"></td>` +
        `<td><input type="text" name="WAESanzahl[${line.key}]" value="1"></td>` +
        `<td><input type="hidden" name="WAESverweinh[${line.key}]" value="3554"></td></tr>`
    )
    .join('');
  return makeDoc(
    `<form name="frmMain"><input type="hidden" name="EINSATZ_ESnr" value="105069"><table><tbody>${rows}</tbody></table></form>`
  );
}

const plane: SybosGeraetLine = {
  sybosId: '81761',
  name: 'DEKON - Abdeckplane GELB',
  kategorie: 'Gerät',
  anzahl: 3,
  einheit: 'stk',
};
const pumpe: SybosGeraetLine = {
  sybosId: '90347',
  name: 'Tauchpumpe',
  kategorie: 'Gerät',
  anzahl: 2.5,
  einheit: 'h',
};
const ohneAnzahl: SybosGeraetLine = { sybosId: '81760', name: 'DEKON - Abdeckplane ROT' };

describe('parseListTypes / listTypeFor', () => {
  it('liest die Listenauswahl aus der Beschriftung der Optionen', () => {
    expect(parseListTypes(popupDoc([]))).toContainEqual({ code: 'cont', label: 'Container' });
  });

  it('wählt die Liste über die Kategorie aus dem Sybos-Export', () => {
    const types = parseListTypes(popupDoc([]));
    expect(listTypeFor(types, 'Container')).toBe('cont');
    expect(listTypeFor(types, ' bekleidung ')).toBe('bekle');
    expect(listTypeFor(types, 'Gerät')).toBe('gerae');
  });

  it('fällt ohne passende Kategorie auf die Geräte-Liste zurück', () => {
    const types = parseListTypes(popupDoc([]));
    expect(listTypeFor(types, undefined)).toBe('gerae');
    expect(listTypeFor(types, 'Verbrauchsmaterial')).toBe('gerae');
    expect(listTypeFor([], 'Gerät')).toBeNull();
  });

  it('gruppiert die Artikel je Liste', () => {
    const types = parseListTypes(popupDoc([]));
    const box: SybosGeraetLine = { sybosId: '73528', name: 'Rollcontainer 1', kategorie: 'Container' };
    const { byType, unlisted } = groupByListType(types, [plane, box, ohneAnzahl]);

    expect([...byType.keys()]).toEqual(['gerae', 'cont']);
    expect(byType.get('gerae')).toEqual([plane, ohneAnzahl]);
    expect(unlisted).toEqual([]);
  });
});

describe('buildListPageParams', () => {
  it('stellt Liste und Seite um wie die Listenauswahl, ohne zu speichern', () => {
    const params = buildListPageParams(popupDoc([], { list: 'fuhrp' }), 'gerae', 100);

    expect(params.get('frmListeListSelect')).toBe('gerae');
    expect(params.get('BListFrom')).toBe('100');
    expect(params.get('filter')).toBe('1');
    expect(params.get('patFormCheckID')).toBe('x~y');
    // Klassenfilter und Suche gehören zur vorigen Liste.
    expect(params.get('LstWAG1WAGnr')).toBe('0');
    expect(params.has('LstWAG2WAGnr')).toBe(false);
    expect(params.get('frmListeListAnf')).toBe('');
    expect(params.has('action_save')).toBe(false);
  });

  it('lässt BListFrom auf der ersten Seite leer', () => {
    expect(buildListPageParams(popupDoc([]), 'cont', 0).get('BListFrom')).toBe('');
  });
});

describe('parseListRange', () => {
  it('liest „(1 - 100 von 294)"', () => {
    expect(parseListRange(popupDoc([], { range: '(1 - 100 von 294)' }))).toEqual({
      from: 1,
      to: 100,
      total: 294,
    });
  });

  it('liefert null ohne Angabe', () => {
    expect(parseListRange(popupDoc([]))).toBeNull();
  });
});

describe('buildGeraeteSelectionParams', () => {
  it('hakt Artikel über die Sybos-ID an, nicht über den Namen', () => {
    const doc = popupDoc([
      { id: '81761', waname: 'Anders benannt' },
      { id: '11111', waname: 'Tauchpumpe' },
    ]);

    const { params, matchedIds } = buildGeraeteSelectionParams(doc, [plane, pumpe]);

    expect(params.getAll('deleted[81761]')).toEqual(['81761']);
    expect(params.has('deleted[11111]')).toBe(false);
    // Die versteckten Felder aller Zeilen gehen mit, wie beim Browser.
    expect(params.getAll('BListMulti[]')).toEqual(['81761', '11111']);
    expect(params.get('action_save')).toBe('action_save');
    expect(params.get('frmListeListSelect')).toBe('gerae');
    expect(matchedIds).toEqual(['81761']);
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
      { key: '81761', name: 'DEKON - Abdeckplane GELB' },
      { key: '90347', name: 'Tauchpumpe' },
      { key: '81760', name: 'DEKON - Abdeckplane ROT' },
      { key: '57738', name: 'KDTFA' },
    ]);

    const { params, amounts } = buildGeraeteAssignmentParams(doc, [plane, pumpe, ohneAnzahl]);

    expect(params.get('WAESanzahl[81761]')).toBe('3');
    expect(params.get('WAESanzahl[90347]')).toBe('3');
    // Ohne Anzahl bleibt der Wert, den SYBOS vorbelegt.
    expect(params.get('WAESanzahl[81760]')).toBe('1');
    // Fremde Zeilen bleiben unberührt.
    expect(params.get('WAESanzahl[57738]')).toBe('1');
    expect(params.get('WAESverweinh[81761]')).toBe('3554');
    expect(params.get('EINSATZ_ESnr')).toBe('105069');
    expect(params.get('action_next')).toBe('action_next');
    expect(params.get('patMultipleChoice')).toBe('true');
    expect(amounts).toEqual([
      { label: 'DEKON - Abdeckplane GELB', anzahl: 3, einheit: 'stk' },
      { label: 'Tauchpumpe', anzahl: 3, einheit: 'h', gerundet: 2.5 },
      { label: 'DEKON - Abdeckplane ROT', missing: 'noAmount' },
    ]);
  });
});
