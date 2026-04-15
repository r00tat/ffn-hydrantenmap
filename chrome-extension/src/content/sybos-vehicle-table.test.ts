import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseSybosVehicleTable,
  hasSybosVehicleTable,
} from './sybos-vehicle-table';

function addVehicleRow(
  table: HTMLTableSectionElement,
  sybosId: string,
  personName: string,
  options?: { skipAdsube?: boolean; skipFunktion?: boolean }
) {
  const tr = document.createElement('tr');

  // Person name cell
  const tdName = document.createElement('td');
  if (!options?.skipAdsube) {
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'ADSUBE';
    input.name = 'ADSUBE';
    input.value = personName;
    input.readOnly = true;
    tdName.appendChild(input);
  }
  tr.appendChild(tdName);

  // Funktion cell
  const tdFunktion = document.createElement('td');
  if (!options?.skipFunktion) {
    const select = document.createElement('select');
    select.name = `ESADgrnr_${sybosId}`;
    select.id = `ESADgrnr_${sybosId}`;
    const opt = document.createElement('option');
    opt.value = '0';
    opt.textContent = '-';
    select.appendChild(opt);
    tdFunktion.appendChild(select);
  }
  tr.appendChild(tdFunktion);

  // Fahrzeug cell
  const tdFahrzeug = document.createElement('td');
  const fahrzeugSelect = document.createElement('select');
  fahrzeugSelect.name = `WARTIKEL_WAnr_${sybosId}`;
  fahrzeugSelect.id = `WARTIKEL_WAnr_${sybosId}`;
  const fOpt = document.createElement('option');
  fOpt.value = '0';
  fOpt.textContent = '-';
  fahrzeugSelect.appendChild(fOpt);
  tdFahrzeug.appendChild(fahrzeugSelect);
  tr.appendChild(tdFahrzeug);

  table.appendChild(tr);
}

function createTable(): HTMLTableSectionElement {
  const table = document.createElement('table');
  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  document.body.appendChild(table);
  return tbody;
}

describe('parseSybosVehicleTable', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('parses one row correctly', () => {
    const tbody = createTable();
    addVehicleRow(tbody, '20357', 'Theuritzbacher Reinhard, 30.08.1983');

    const result = parseSybosVehicleTable();
    expect(result).toHaveLength(1);
    expect(result[0].sybosId).toBe('20357');
    expect(result[0].personName).toBe('Theuritzbacher Reinhard');
    expect(result[0].funktionSelect).toBeInstanceOf(HTMLSelectElement);
    expect(result[0].fahrzeugSelect).toBeInstanceOf(HTMLSelectElement);
  });

  it('parses multiple rows in DOM order', () => {
    const tbody = createTable();
    addVehicleRow(tbody, '20357', 'Theuritzbacher Reinhard, 30.08.1983');
    addVehicleRow(tbody, '87238', 'Müller Franz, 15.03.1990');

    const result = parseSybosVehicleTable();
    expect(result).toHaveLength(2);
    expect(result[0].sybosId).toBe('20357');
    expect(result[0].personName).toBe('Theuritzbacher Reinhard');
    expect(result[1].sybosId).toBe('87238');
    expect(result[1].personName).toBe('Müller Franz');
  });

  it('strips birthdate from person name', () => {
    const tbody = createTable();
    addVehicleRow(tbody, '12345', 'Mustermann Jörg, 01.01.2000');

    const result = parseSybosVehicleTable();
    expect(result).toHaveLength(1);
    expect(result[0].personName).toBe('Mustermann Jörg');
  });

  it('handles person name without comma', () => {
    const tbody = createTable();
    addVehicleRow(tbody, '12345', 'Firstname Lastname');

    const result = parseSybosVehicleTable();
    expect(result).toHaveLength(1);
    expect(result[0].personName).toBe('Firstname Lastname');
  });

  it('returns empty array when no vehicle table exists', () => {
    const div = document.createElement('div');
    div.textContent = 'No table here';
    document.body.appendChild(div);
    expect(parseSybosVehicleTable()).toEqual([]);
  });

  it('skips rows where the ADSUBE input is missing', () => {
    const tbody = createTable();
    addVehicleRow(tbody, '20357', 'Theuritzbacher Reinhard, 30.08.1983');
    addVehicleRow(tbody, '99999', '', { skipAdsube: true });

    const result = parseSybosVehicleTable();
    expect(result).toHaveLength(1);
    expect(result[0].sybosId).toBe('20357');
  });

  it('skips rows where the ESADgrnr select is missing', () => {
    const tbody = createTable();
    addVehicleRow(tbody, '20357', 'Theuritzbacher Reinhard, 30.08.1983');
    addVehicleRow(tbody, '99999', 'Someone Else, 01.01.1990', {
      skipFunktion: true,
    });

    const result = parseSybosVehicleTable();
    expect(result).toHaveLength(1);
    expect(result[0].sybosId).toBe('20357');
  });
});

describe('hasSybosVehicleTable', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('returns true when at least one WARTIKEL_WAnr select exists', () => {
    const tbody = createTable();
    addVehicleRow(tbody, '20357', 'Theuritzbacher Reinhard, 30.08.1983');
    expect(hasSybosVehicleTable()).toBe(true);
  });

  it('returns false when none exists', () => {
    expect(hasSybosVehicleTable()).toBe(false);
  });
});
