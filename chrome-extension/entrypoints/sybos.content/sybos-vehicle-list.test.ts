import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseSybosVehicleList,
  hasSybosVehicleList,
} from './sybos-vehicle-list';

function addVehicleRow(
  container: HTMLElement,
  id: string,
  waname: string,
  warufname: string
) {
  const tr = document.createElement('tr');

  // Checkbox cell
  const tdCheck = document.createElement('td');
  const divCheck = document.createElement('div');
  divCheck.className = 'x-grid3-cell-inner x-grid3-col-deleted';
  const hiddenBList = document.createElement('input');
  hiddenBList.type = 'hidden';
  hiddenBList.name = 'BListMulti[]';
  hiddenBList.value = id;
  divCheck.appendChild(hiddenBList);
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.name = `deleted[${id}]`;
  checkbox.value = id;
  divCheck.appendChild(checkbox);
  const hiddenNameTbl = document.createElement('input');
  hiddenNameTbl.type = 'hidden';
  hiddenNameTbl.name = `name_tbl[deleted[${id}]]`;
  hiddenNameTbl.value = '{GEbez}';
  divCheck.appendChild(hiddenNameTbl);
  tdCheck.appendChild(divCheck);
  tr.appendChild(tdCheck);

  // WAname cell
  const tdWAname = document.createElement('td');
  const divWAname = document.createElement('div');
  divWAname.className = 'x-grid3-cell-inner x-grid3-col-WAname';
  divWAname.textContent = waname;
  tdWAname.appendChild(divWAname);
  tr.appendChild(tdWAname);

  // WArufname cell
  const tdRuf = document.createElement('td');
  const divRuf = document.createElement('div');
  divRuf.className = 'x-grid3-cell-inner x-grid3-col-WArufname';
  divRuf.textContent = warufname;
  tdRuf.appendChild(divRuf);
  tr.appendChild(tdRuf);

  container.appendChild(tr);
}

describe('parseSybosVehicleList', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('extracts rows with id, waname, warufname and checkbox', () => {
    const table = document.createElement('table');
    const tbody = document.createElement('tbody');
    table.appendChild(tbody);
    document.body.appendChild(table);
    addVehicleRow(tbody, '2006', 'SRF', 'Rüst Neusiedl am See');
    addVehicleRow(tbody, '46143', 'RLFA 3000/100', 'RüstLösch Neusiedl am See');

    const rows = parseSybosVehicleList();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: '2006',
      waname: 'SRF',
      warufname: 'Rüst Neusiedl am See',
    });
    expect(rows[0].checkbox).toBeInstanceOf(HTMLInputElement);
    expect(rows[1].waname).toBe('RLFA 3000/100');
  });

  it('treats non-breaking-space WArufname as empty', () => {
    const table = document.createElement('table');
    const tbody = document.createElement('tbody');
    table.appendChild(tbody);
    document.body.appendChild(table);
    addVehicleRow(tbody, '3028', 'ATS Einachsanhänger', '\u00a0');

    const rows = parseSybosVehicleList();
    expect(rows).toHaveLength(1);
    expect(rows[0].warufname).toBe('');
  });

  it('returns empty array when no vehicle rows are present', () => {
    document.body.appendChild(document.createElement('div'));
    expect(parseSybosVehicleList()).toEqual([]);
  });

  it('skips rows without a WAname column', () => {
    const table = document.createElement('table');
    const tbody = document.createElement('tbody');
    table.appendChild(tbody);
    document.body.appendChild(table);

    const tr = document.createElement('tr');
    const td = document.createElement('td');
    const div = document.createElement('div');
    div.className = 'x-grid3-col-deleted';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.name = 'deleted[999]';
    div.appendChild(cb);
    td.appendChild(div);
    tr.appendChild(td);
    tbody.appendChild(tr);

    expect(parseSybosVehicleList()).toEqual([]);
  });
});

describe('parseSybosVehicleList with custom root', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('parses rows from a detached document root and ignores the global document', () => {
    // Unrelated markup in the global document, to prove it's ignored.
    const globalTable = document.createElement('table');
    const globalTbody = document.createElement('tbody');
    globalTable.appendChild(globalTbody);
    document.body.appendChild(globalTable);
    addVehicleRow(globalTbody, '9999', 'GlobalDoc', 'Global Document Vehicle');

    const doc = new DOMParser().parseFromString(
      '<html><body><table><tbody></tbody></table></body></html>',
      'text/html'
    );
    const tbody = doc.querySelector('tbody')!;
    addVehicleRow(tbody, '2006', 'SRF', 'Rüst Neusiedl am See');

    const rows = parseSybosVehicleList(doc);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: '2006',
      waname: 'SRF',
      warufname: 'Rüst Neusiedl am See',
    });
  });
});

describe('hasSybosVehicleList', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('returns true when at least one WAname column is present', () => {
    const div = document.createElement('div');
    div.className = 'x-grid3-col-WAname';
    div.textContent = 'SRF';
    document.body.appendChild(div);
    expect(hasSybosVehicleList()).toBe(true);
  });

  it('returns false when no WAname column exists', () => {
    document.body.appendChild(document.createElement('span'));
    expect(hasSybosVehicleList()).toBe(false);
  });

  it('detects a WAname column only within the given root, not the global document', () => {
    const globalDiv = document.createElement('div');
    globalDiv.className = 'x-grid3-col-WAname';
    globalDiv.textContent = 'Global Document Vehicle';
    document.body.appendChild(globalDiv);

    const doc = new DOMParser().parseFromString(
      '<html><body></body></html>',
      'text/html'
    );
    expect(hasSybosVehicleList(doc)).toBe(false);

    const div = doc.createElement('div');
    div.className = 'x-grid3-col-WAname';
    div.textContent = 'SRF';
    doc.body.appendChild(div);
    expect(hasSybosVehicleList(doc)).toBe(true);
  });
});
