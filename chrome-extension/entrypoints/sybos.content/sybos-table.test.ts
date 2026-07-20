import { describe, it, expect, beforeEach } from 'vitest';
import { parseSybosPersonTable, hasSybosPersonTable } from './sybos-table';

function addPersonRow(container: HTMLElement, id: string, name: string) {
  const wrapper = document.createElement('div');
  wrapper.className = 'x-grid3-cell-inner x-grid3-col-selected';

  const hidden1 = document.createElement('input');
  hidden1.type = 'hidden';
  hidden1.name = 'BListMulti[]';
  hidden1.value = id;
  wrapper.appendChild(hidden1);

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.name = `selected[${id}]`;
  checkbox.className = 'checkbox';
  checkbox.value = id;
  wrapper.appendChild(checkbox);

  const hidden2 = document.createElement('input');
  hidden2.type = 'hidden';
  hidden2.name = `name_tbl[${id}]`;
  hidden2.value = id;
  wrapper.appendChild(hidden2);

  const nameInput = document.createElement('input');
  nameInput.type = 'hidden';
  nameInput.name = `name_tbl[deleted[${id}]]`;
  nameInput.value = name;
  wrapper.appendChild(nameInput);

  container.appendChild(wrapper);
}

describe('parseSybosPersonTable', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('parses person entries from the DOM', () => {
    addPersonRow(document.body, '1406', 'Mustermann Jörg');
    addPersonRow(document.body, '1407', 'Müller Franz');

    const result = parseSybosPersonTable();
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: '1406',
      name: 'Mustermann Jörg',
      checkbox: expect.any(HTMLInputElement),
    });
    expect(result[1]).toEqual({
      id: '1407',
      name: 'Müller Franz',
      checkbox: expect.any(HTMLInputElement),
    });
  });

  it('returns empty array when no person table exists', () => {
    const div = document.createElement('div');
    div.textContent = 'No table here';
    document.body.appendChild(div);
    expect(parseSybosPersonTable()).toEqual([]);
  });

  it('skips rows with {GEbez} template placeholder value', () => {
    addPersonRow(document.body, '1406', 'Mustermann Jörg');
    addPersonRow(document.body, '2006', '{GEbez}');
    addPersonRow(document.body, '1407', 'Müller Franz');

    const result = parseSybosPersonTable();
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.id)).toEqual(['1406', '1407']);
  });
});

describe('parseSybosPersonTable with custom root', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('parses person entries from a detached document root and ignores the global document', () => {
    // Put unrelated markup in the global document to prove it's ignored.
    addPersonRow(document.body, '9999', 'Global Document Person');

    const doc = new DOMParser().parseFromString(
      '<html><body></body></html>',
      'text/html'
    );
    addPersonRow(doc.body, '1406', 'Mustermann Jörg');

    const result = parseSybosPersonTable(doc);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: '1406',
      name: 'Mustermann Jörg',
      checkbox: expect.any(HTMLInputElement),
    });
  });

  it('parses person entries from a detached container element', () => {
    addPersonRow(document.body, '9999', 'Global Document Person');

    const container = document.createElement('div');
    addPersonRow(container, '1407', 'Müller Franz');

    const result = parseSybosPersonTable(container);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1407');
  });
});

describe('hasSybosPersonTable', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('returns true when person table exists', () => {
    addPersonRow(document.body, '1406', 'Mustermann Jörg');
    expect(hasSybosPersonTable()).toBe(true);
  });

  it('returns false when no person table exists', () => {
    expect(hasSybosPersonTable()).toBe(false);
  });

  it('returns false when table contains only {GEbez} rows', () => {
    addPersonRow(document.body, '2006', '{GEbez}');
    addPersonRow(document.body, '2007', '{GEbez}');
    expect(hasSybosPersonTable()).toBe(false);
  });

  it('detects a person table only within the given root, not the global document', () => {
    addPersonRow(document.body, '9999', 'Global Document Person');

    const doc = new DOMParser().parseFromString(
      '<html><body></body></html>',
      'text/html'
    );
    expect(hasSybosPersonTable(doc)).toBe(false);

    addPersonRow(doc.body, '1406', 'Mustermann Jörg');
    expect(hasSybosPersonTable(doc)).toBe(true);
  });
});
