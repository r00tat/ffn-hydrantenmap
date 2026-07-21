import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  serializeForm,
  parseHtml,
  postForm,
  getDocument,
  findEinsatzId,
  detectError,
} from './sybos-post';

function buildForm(html: string): HTMLFormElement {
  document.body.innerHTML = `<form id="f">${html}</form>`;
  return document.getElementById('f') as HTMLFormElement;
}

describe('serializeForm', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('includes text and hidden inputs', () => {
    const form = buildForm(`
      <input type="text" name="txt" value="hello">
      <input type="hidden" name="EINSATZ_ESnr" value="103004">
    `);
    const params = serializeForm(form);
    expect(params.get('txt')).toBe('hello');
    expect(params.get('EINSATZ_ESnr')).toBe('103004');
  });

  it('includes the selected option value of a select', () => {
    const form = buildForm(`
      <select name="sel">
        <option value="x">X</option>
        <option value="y" selected>Y</option>
      </select>
    `);
    const params = serializeForm(form);
    expect(params.get('sel')).toBe('y');
  });

  it('includes textarea content', () => {
    const form = buildForm(`<textarea name="ta">some notes</textarea>`);
    const params = serializeForm(form);
    expect(params.get('ta')).toBe('some notes');
  });

  it('includes a checked checkbox as name=value', () => {
    const form = buildForm(
      `<input type="checkbox" name="selected[96431]" value="96431" checked>`
    );
    const params = serializeForm(form);
    expect(params.get('selected[96431]')).toBe('96431');
  });

  it('omits an unchecked checkbox entirely', () => {
    const form = buildForm(
      `<input type="checkbox" name="selected[99]" value="99">`
    );
    const params = serializeForm(form);
    expect(params.has('selected[99]')).toBe(false);
  });

  it('includes only the checked radio in a group', () => {
    const form = buildForm(`
      <input type="radio" name="r" value="a">
      <input type="radio" name="r" value="b" checked>
    `);
    const params = serializeForm(form);
    expect(params.getAll('r')).toEqual(['b']);
  });

  it('preserves duplicate array-style names and document order', () => {
    const form = buildForm(`
      <input type="hidden" name="BListMulti[]" value="1">
      <input type="hidden" name="BListMulti[]" value="2">
      <input type="hidden" name="BListMulti[]" value="3">
    `);
    const params = serializeForm(form);
    expect(params.getAll('BListMulti[]')).toEqual(['1', '2', '3']);
  });

  it('preserves bracketed nested names verbatim', () => {
    const form = buildForm(
      `<input type="hidden" name="name_tbl[deleted[96431]]" value="Mustermann Jörg">`
    );
    const params = serializeForm(form);
    expect(params.get('name_tbl[deleted[96431]]')).toBe('Mustermann Jörg');
  });

  it('does not include a submit button automatically', () => {
    const form = buildForm(`
      <input type="text" name="txt" value="hello">
      <button type="submit" name="btnSubmit" value="save">Save</button>
      <input type="submit" name="submitInput" value="Go">
    `);
    const params = serializeForm(form);
    expect(params.has('btnSubmit')).toBe(false);
    expect(params.has('submitInput')).toBe(false);
  });

  it('applies a string override by replacing all existing entries with one', () => {
    const form = buildForm(`
      <input type="hidden" name="BListMulti[]" value="1">
      <input type="hidden" name="BListMulti[]" value="2">
    `);
    const params = serializeForm(form, { 'BListMulti[]': '99' });
    expect(params.getAll('BListMulti[]')).toEqual(['99']);
  });

  it('applies a null override by deleting all existing entries', () => {
    const form = buildForm(`
      <input type="hidden" name="BListMulti[]" value="1">
      <input type="hidden" name="BListMulti[]" value="2">
    `);
    const params = serializeForm(form, { 'BListMulti[]': null });
    expect(params.has('BListMulti[]')).toBe(false);
  });

  it('adds a submit-marker key via overrides that was not present on the form', () => {
    const form = buildForm(`<input type="text" name="txt" value="hello">`);
    const params = serializeForm(form, { btnSubmit: 'save' });
    expect(params.get('btnSubmit')).toBe('save');
  });

  it('leaves keys absent from overrides untouched', () => {
    const form = buildForm(`
      <input type="text" name="txt" value="hello">
      <input type="hidden" name="EINSATZ_ESnr" value="103004">
    `);
    const params = serializeForm(form, { txt: 'changed' });
    expect(params.get('txt')).toBe('changed');
    expect(params.get('EINSATZ_ESnr')).toBe('103004');
  });
});

describe('parseHtml', () => {
  it('parses an HTML string into a Document', () => {
    const doc = parseHtml('<html><body><div id="x">hi</div></body></html>');
    expect(doc.getElementById('x')?.textContent).toBe('hi');
  });
});

describe('postForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts urlencoded params with credentials and returns the parsed response document', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '<html><body><div id="ok">done</div></body></html>',
    });
    vi.stubGlobal('fetch', fetchMock);

    const params = new URLSearchParams({ foo: 'bar' });
    const doc = await postForm('https://sybos.lfv-bgld.at/some/action', params);

    expect(fetchMock).toHaveBeenCalledWith('https://sybos.lfv-bgld.at/some/action', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'foo=bar',
    });
    expect(doc.getElementById('ok')?.textContent).toBe('done');
  });

  it('throws an error including the status when the response is not ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      postForm('https://sybos.lfv-bgld.at/some/action', new URLSearchParams())
    ).rejects.toThrow(/500/);
  });
});

describe('getDocument', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GETs the url with credentials and returns the parsed response document', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '<html><body><div id="ok">loaded</div></body></html>',
    });
    vi.stubGlobal('fetch', fetchMock);

    const doc = await getDocument('https://sybos.lfv-bgld.at/some/page');

    expect(fetchMock).toHaveBeenCalledWith('https://sybos.lfv-bgld.at/some/page', {
      credentials: 'include',
    });
    expect(doc.getElementById('ok')?.textContent).toBe('loaded');
  });

  it('throws an error including the status when the response is not ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      getDocument('https://sybos.lfv-bgld.at/missing')
    ).rejects.toThrow(/404/);
  });
});

describe('findEinsatzId', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('finds the id from the EINSATZ_ESnr hidden input in the default document', () => {
    document.body.innerHTML =
      '<input type="hidden" name="EINSATZ_ESnr" value="103004">';
    expect(findEinsatzId()).toBe('103004');
  });

  it('falls back to idParent from window.location when no hidden input is present', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, search: '?foo=1&idParent=103004&bar=2' },
    });
    // no hidden input in the document, so it should fall back to the URL
    expect(findEinsatzId()).toBe('103004');
  });

  it('returns the idParent from window.location.search when reachable', () => {
    document.body.replaceChildren();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, search: '?idParent=203099' },
    });
    expect(findEinsatzId()).toBe('203099');
  });

  it('prefers the hidden input over the URL when both are present', () => {
    document.body.innerHTML =
      '<input type="hidden" name="EINSATZ_ESnr" value="103004">';
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, search: '?idParent=999999' },
    });
    expect(findEinsatzId()).toBe('103004');
  });

  it('looks up the hidden input within a given root', () => {
    const root = document.createElement('div');
    root.innerHTML = '<input type="hidden" name="EINSATZ_ESnr" value="555">';
    expect(findEinsatzId(root)).toBe('555');
  });

  it('looks up the hidden input within a fetched Document argument', () => {
    const doc = parseHtml(
      '<html><body><input type="hidden" name="EINSATZ_ESnr" value="777"></body></html>'
    );
    expect(findEinsatzId(doc)).toBe('777');
  });

  it('does not fall back to window.location when a root argument is given, even without a hidden input', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, search: '?idParent=103004' },
    });
    const doc = parseHtml('<html><body><div>no id here</div></body></html>');
    expect(findEinsatzId(doc)).toBeNull();
  });

  it('extracts idParent from a popup link when no hidden input or URL param exists (detail page)', () => {
    // The frmEinsatzAdd detail page has id=0 in its own URL and no
    // EINSATZ_ESnr, but bakes idParent=<id> into every sub-form popup link.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, search: '?comp=sybEinsatz&s=frmEinsatzAdd&id=0' },
    });
    document.body.innerHTML =
      '<a href="indexFrm.php?comp=sybPersonal&s=PersonalAuswahl&idParent=103013&id=0">Personal</a>';
    expect(findEinsatzId()).toBe('103013');
  });

  it('extracts idParent from an onclick handler and ignores idParent=0', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<span onclick="openPopup(\'idParent=0\')">new</span>' +
      '<span onclick="openPopup(\'foo&idParent=103013&bar\')">open</span>';
    expect(findEinsatzId(root)).toBe('103013');
  });

  it('prefers the hidden input over a popup link', () => {
    document.body.innerHTML =
      '<input type="hidden" name="EINSATZ_ESnr" value="103004">' +
      '<a href="x?idParent=999999">Personal</a>';
    expect(findEinsatzId()).toBe('103004');
  });

  it('returns null when nothing is found anywhere', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, search: '' },
    });
    expect(findEinsatzId()).toBeNull();
  });
});

describe('detectError', () => {
  it('returns null for a normal page without error markers', () => {
    const doc = parseHtml(
      '<html><body><form><input type="text" name="txt"></form></body></html>'
    );
    expect(detectError(doc)).toBeNull();
  });

  it('detects an element with a class containing "error"', () => {
    const doc = parseHtml(
      '<html><body><div class="error-message">Feld ist ungültig</div></body></html>'
    );
    expect(detectError(doc)).toBe('Feld ist ungültig');
  });

  it('detects an element with a class containing "fehler"', () => {
    const doc = parseHtml(
      '<html><body><span class="fehlerText">Bitte Datum angeben</span></body></html>'
    );
    expect(detectError(doc)).toBe('Bitte Datum angeben');
  });

  it('detects an element with a class containing "patError" (SYBOS/PAT-specific)', () => {
    const doc = parseHtml(
      '<html><body><div class="patError">Ungültiger Wert</div></body></html>'
    );
    expect(detectError(doc)).toBe('Ungültiger Wert');
  });

  it('does NOT flag a static "Pflichtfeld" legend without an error class', () => {
    // The successful edit-form response often carries a required-field
    // legend; a body-wide keyword scan would misreport every success.
    const doc = parseHtml(
      '<html><body><p>Felder mit * sind Pflichtfelder.</p></body></html>'
    );
    expect(detectError(doc)).toBeNull();
  });

  it('detects a "Pflichtfeld" message inside an error-styled element', () => {
    const doc = parseHtml(
      '<html><body><div class="patError">Name ist ein Pflichtfeld.</div></body></html>'
    );
    expect(detectError(doc)).toMatch(/Pflichtfeld/);
  });

  it('ignores error-class elements with no text content', () => {
    const doc = parseHtml(
      '<html><body><div class="error-icon"></div><div class="error-message">Wirklicher Fehler</div></body></html>'
    );
    expect(detectError(doc)).toBe('Wirklicher Fehler');
  });

  it('caps very long error text to a reasonable length', () => {
    const longText = 'x'.repeat(1000);
    const doc = parseHtml(
      `<html><body><div class="error">${longText}</div></body></html>`
    );
    const result = detectError(doc);
    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThan(1000);
  });
});
