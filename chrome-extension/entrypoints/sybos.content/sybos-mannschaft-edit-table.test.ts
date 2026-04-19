import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseSybosMannschaftEditTable,
  hasSybosMannschaftEditTable,
} from './sybos-mannschaft-edit-table';

interface RowOpts {
  skipAdr?: boolean;
  skipFunktion?: boolean;
  skipStatus?: boolean;
}

function addRow(
  tbody: HTMLTableSectionElement,
  adrId: string,
  rowKey: string,
  personName: string,
  opts: RowOpts = {}
) {
  const tr = document.createElement('tr');

  // Name cell
  const tdName = document.createElement('td');
  const hidden = document.createElement('input');
  hidden.type = 'hidden';
  hidden.name = `ESADid[${adrId}~100466~2026-04-13~18:35:00]`;
  hidden.value = `${adrId}~100466~2026-04-13~18:35:00`;
  tdName.appendChild(hidden);

  if (!opts.skipAdr) {
    const input = document.createElement('input');
    input.type = 'text';
    input.id = `ADR_${adrId}`;
    input.name = `ADR_${adrId}`;
    input.value = personName;
    input.readOnly = true;
    tdName.appendChild(input);
  }
  tr.appendChild(tdName);

  // Status cell
  const tdStatus = document.createElement('td');
  if (!opts.skipStatus) {
    const status = document.createElement('select');
    status.name = `ESADStatusListe_${rowKey}`;
    status.id = `ESADStatusListe_${rowKey}`;
    const opt = document.createElement('option');
    opt.value = '8307';
    opt.textContent = 'ausgerückt';
    opt.selected = true;
    status.appendChild(opt);
    tdStatus.appendChild(status);
  }
  tr.appendChild(tdStatus);

  // Funktion cell
  const tdFunktion = document.createElement('td');
  if (!opts.skipFunktion) {
    const funktion = document.createElement('select');
    funktion.name = `ESADFunktionListe_${rowKey}`;
    funktion.id = `ESADFunktionListe_${rowKey}`;
    const f0 = document.createElement('option');
    f0.value = '0';
    f0.textContent = '-';
    funktion.appendChild(f0);
    const f1 = document.createElement('option');
    f1.value = '1464';
    f1.textContent = 'Feuerwehrmann';
    funktion.appendChild(f1);
    tdFunktion.appendChild(funktion);
  }
  tr.appendChild(tdFunktion);

  // Fahrzeug cell
  const tdFahrzeug = document.createElement('td');
  const fahrzeug = document.createElement('select');
  fahrzeug.name = `ESADFahrzeugListe_${rowKey}`;
  fahrzeug.id = `ESADFahrzeugListe_${rowKey}`;
  const v0 = document.createElement('option');
  v0.value = '0';
  v0.textContent = '-';
  fahrzeug.appendChild(v0);
  const v1 = document.createElement('option');
  v1.value = '57738';
  v1.textContent = 'KDTFA (Kommando Neusiedl am See)';
  fahrzeug.appendChild(v1);
  tdFahrzeug.appendChild(fahrzeug);
  tr.appendChild(tdFahrzeug);

  tbody.appendChild(tr);
}

function createTable(): HTMLTableSectionElement {
  const table = document.createElement('table');
  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  document.body.appendChild(table);
  return tbody;
}

describe('parseSybosMannschaftEditTable', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('parses a single row', () => {
    const tbody = createTable();
    addRow(
      tbody,
      '49968',
      '49968_100466_2026_04_13_18_35_00',
      'Bencic Florian, MSc, 26.01.1995'
    );

    const result = parseSybosMannschaftEditTable();
    expect(result).toHaveLength(1);
    expect(result[0].adrId).toBe('49968');
    expect(result[0].rowKey).toBe('49968_100466_2026_04_13_18_35_00');
    expect(result[0].personName).toBe('Bencic Florian');
    expect(result[0].statusSelect).toBeInstanceOf(HTMLSelectElement);
    expect(result[0].funktionSelect).toBeInstanceOf(HTMLSelectElement);
    expect(result[0].fahrzeugSelect).toBeInstanceOf(HTMLSelectElement);
  });

  it('parses multiple rows in DOM order', () => {
    const tbody = createTable();
    addRow(
      tbody,
      '49968',
      '49968_100466_2026_04_13_18_35_00',
      'Bencic Florian, MSc, 26.01.1995'
    );
    addRow(
      tbody,
      '87901',
      '87901_100466_2026_04_13_18_35_00',
      'Ethofer Lukas, 21.09.2005'
    );
    addRow(
      tbody,
      '86864',
      '86864_100466_2026_04_13_18_35_00',
      'Ing. Preis Thomas, 06.02.1988'
    );

    const result = parseSybosMannschaftEditTable();
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.adrId)).toEqual(['49968', '87901', '86864']);
    expect(result.map((r) => r.personName)).toEqual([
      'Bencic Florian',
      'Ethofer Lukas',
      'Ing. Preis Thomas',
    ]);
  });

  it('strips the date suffix from person name', () => {
    const tbody = createTable();
    addRow(
      tbody,
      '1433',
      '1433_100466_2026_04_13_18_35_00',
      'Köstner Günther, 09.01.1970'
    );
    const result = parseSybosMannschaftEditTable();
    expect(result[0].personName).toBe('Köstner Günther');
  });

  it('strips titles and date for names with multiple commas', () => {
    const tbody = createTable();
    addRow(
      tbody,
      '66063',
      '66063_100466_2026_04_13_18_35_00',
      'Meyer Denise, BSc, MBA, 29.07.1995'
    );
    const result = parseSybosMannschaftEditTable();
    expect(result[0].personName).toBe('Meyer Denise');
  });

  it('handles a name without any comma', () => {
    const tbody = createTable();
    addRow(tbody, '1234', '1234_100466_2026_04_13_18_35_00', 'OnlyName');
    const result = parseSybosMannschaftEditTable();
    expect(result[0].personName).toBe('OnlyName');
  });

  it('skips rows where the ADR_ input is missing', () => {
    const tbody = createTable();
    addRow(
      tbody,
      '1',
      '1_100466_2026_04_13_18_35_00',
      'Mustermann Max, 01.01.2000'
    );
    addRow(tbody, '2', '2_100466_2026_04_13_18_35_00', '', { skipAdr: true });
    const result = parseSybosMannschaftEditTable();
    expect(result).toHaveLength(1);
    expect(result[0].adrId).toBe('1');
  });

  it('skips rows where the Funktion select is missing', () => {
    const tbody = createTable();
    addRow(
      tbody,
      '1',
      '1_100466_2026_04_13_18_35_00',
      'Mustermann Max, 01.01.2000'
    );
    addRow(
      tbody,
      '2',
      '2_100466_2026_04_13_18_35_00',
      'Somebody Else, 01.01.2001',
      { skipFunktion: true }
    );
    const result = parseSybosMannschaftEditTable();
    expect(result).toHaveLength(1);
    expect(result[0].adrId).toBe('1');
  });

  it('returns empty array when no fahrzeug list select exists', () => {
    const div = document.createElement('div');
    div.textContent = 'No table here';
    document.body.appendChild(div);
    expect(parseSybosMannschaftEditTable()).toEqual([]);
  });
});

describe('hasSybosMannschaftEditTable', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('returns true when at least one ESADFahrzeugListe_ select exists', () => {
    const tbody = createTable();
    addRow(
      tbody,
      '49968',
      '49968_100466_2026_04_13_18_35_00',
      'Bencic Florian, MSc, 26.01.1995'
    );
    expect(hasSybosMannschaftEditTable()).toBe(true);
  });

  it('returns false when no such selects exist', () => {
    expect(hasSybosMannschaftEditTable()).toBe(false);
  });

  it('does not confuse the single-value ESADFahrzeug template selects', () => {
    // The edit page also has a top "set_values" select without the _key suffix.
    // That is not part of the per-row list and must not be detected.
    const topSelect = document.createElement('select');
    topSelect.name = 'WARTIKEL_WAnr';
    topSelect.id = 'WARTIKEL_WAnr';
    document.body.appendChild(topSelect);
    expect(hasSybosMannschaftEditTable()).toBe(false);
  });
});
