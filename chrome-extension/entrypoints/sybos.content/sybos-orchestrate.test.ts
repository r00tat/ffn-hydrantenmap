import { describe, it, expect } from 'vitest';
import {
  buildPersonalSelectionParams,
  buildPersonalAssignmentParams,
  buildMaterialSelectionParams,
  buildMaterialAssignmentParams,
  type CrewAssignment,
  type FirecallVehicle,
} from './sybos-orchestrate';

function makeDoc(bodyHtml: string): Document {
  return new DOMParser().parseFromString(
    `<html><body>${bodyHtml}</body></html>`,
    'text/html'
  );
}

// --- Fixtures -------------------------------------------------------------

/** A PersonalAuswahl popup: form[name=frmMain] with roster rows. */
function personSelectionDoc(
  persons: { id: string; name: string }[]
): Document {
  const doc = makeDoc(
    '<form name="frmMain"><input type="hidden" name="patSave" value="1"></form>'
  );
  const form = doc.querySelector('form')!;
  for (const p of persons) {
    const nameInput = doc.createElement('input');
    nameInput.type = 'hidden';
    nameInput.name = `name_tbl[deleted[${p.id}]]`;
    nameInput.value = p.name;
    form.appendChild(nameInput);

    const checkbox = doc.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = `selected[${p.id}]`;
    checkbox.value = p.id;
    form.appendChild(checkbox);
  }
  return doc;
}

interface AssignRowSpec {
  id: string;
  personName: string; // "Nachname Vorname, DD.MM.YYYY"
  funktionOptions: [string, string][]; // [value, text]
  vehicleOptions: [string, string][];
}

/** The MannschaftEinsatz edit form. */
function personAssignmentDoc(rows: AssignRowSpec[]): Document {
  const doc = makeDoc(
    '<form name="frmMain"><table><tbody></tbody></table></form>'
  );
  const tbody = doc.querySelector('tbody')!;
  for (const r of rows) {
    const tr = doc.createElement('tr');

    const tdName = doc.createElement('td');
    const adsube = doc.createElement('input');
    adsube.name = 'ADSUBE';
    adsube.value = r.personName;
    tdName.appendChild(adsube);
    tr.appendChild(tdName);

    const tdFunktion = doc.createElement('td');
    const fSel = doc.createElement('select');
    fSel.name = `ESADgrnr_${r.id}`;
    for (const [value, text] of r.funktionOptions) {
      const o = doc.createElement('option');
      o.value = value;
      o.textContent = text;
      fSel.appendChild(o);
    }
    tdFunktion.appendChild(fSel);
    tr.appendChild(tdFunktion);

    const tdFahrzeug = doc.createElement('td');
    const vSel = doc.createElement('select');
    vSel.name = `WARTIKEL_WAnr_${r.id}`;
    for (const [value, text] of r.vehicleOptions) {
      const o = doc.createElement('option');
      o.value = value;
      o.textContent = text;
      vSel.appendChild(o);
    }
    tdFahrzeug.appendChild(vSel);
    tr.appendChild(tdFahrzeug);

    tbody.appendChild(tr);
  }
  return doc;
}

/**
 * The frmGeraetSelect material-selection popup, as it actually arrives when
 * FETCHED (no client-side JS has run, so there's no rendered ExtJS grid —
 * only the `var myData = [...]` array a real browser would use to build it).
 */
function materialSelectionRow(
  id: string,
  waname: string,
  warufname = ''
): unknown[] {
  const html =
    `<input name='BListMulti[]' value='${id}' type='hidden'/>` +
    `<input name='deleted[${id}]' id='selected_tbl[]' value='${id}' type='checkbox' class='checkbox' />` +
    `<input type='hidden' name='name_tbl[${id}]' value='${id}'>` +
    `<input type='hidden' name='id_tbl[${id}]' value='${id}'>` +
    `<input type='hidden' name='name_tbl[deleted[${id}]]' value='{GEbez}'>`;
  return [html, waname, 'Ort', 'Kennzeichen', 'Kategorie', 'Untertyp', warufname, ''];
}

function materialSelectionDoc(
  vehicles: { id: string; waname: string; warufname?: string }[]
): Document {
  const rows = vehicles.map((v) =>
    materialSelectionRow(v.id, v.waname, v.warufname)
  );
  const script = `var myData = ${JSON.stringify(rows)};`;
  return makeDoc(
    `<form name="frmMain"><input type="hidden" name="patFormCheckID" value="x~y"><script>${script}</script></form>`
  );
}

// --- buildPersonalSelectionParams ----------------------------------------

describe('buildPersonalSelectionParams', () => {
  it('checks matched persons and reports matched/notFound', () => {
    const doc = personSelectionDoc([
      { id: '1406', name: 'Mustermann Jörg' },
      { id: '1407', name: 'Müller Franz' },
    ]);
    const assignments: CrewAssignment[] = [
      { id: 'a', name: 'Jörg Mustermann' }, // reversed order -> matches 1406
      { id: 'b', name: 'Unbekannt Person' },
    ];

    const { params, matched, notFound } = buildPersonalSelectionParams(
      doc,
      assignments
    );

    expect(matched).toEqual(['Jörg Mustermann']);
    expect(notFound).toEqual(['Unbekannt Person']);
    expect(params.get('selected[1406]')).toBe('1406');
    expect(params.has('selected[1407]')).toBe(false);
    expect(params.get('action_next')).toBe('action_next');
    expect(params.get('filter')).toBe('1');
    // preserves the roster's own hidden fields
    expect(params.get('patSave')).toBe('1');
  });

  it('throws when the document has no form', () => {
    const doc = makeDoc('<div>no form here</div>');
    expect(() => buildPersonalSelectionParams(doc, [])).toThrow(/form/i);
  });
});

// --- buildPersonalAssignmentParams ----------------------------------------

describe('buildPersonalAssignmentParams', () => {
  it('sets funktion and fahrzeug selects for matched persons', () => {
    const doc = personAssignmentDoc([
      {
        id: '20357',
        personName: 'Theuritzbacher Reinhard, 30.08.1983',
        funktionOptions: [
          ['0', '-'],
          ['5', 'Gruppenkommandant'],
        ],
        vehicleOptions: [
          ['0', '-'],
          ['46143', 'RLFA 3000/100'],
        ],
      },
    ]);
    const assignments: CrewAssignment[] = [
      {
        id: 'a',
        name: 'Reinhard Theuritzbacher',
        funktion: 'Gruppenkommandant',
        vehicleName: 'RLFA 3000/100',
      },
    ];

    const { params, assigned, noVehicle } = buildPersonalAssignmentParams(
      doc,
      assignments
    );

    expect(assigned).toEqual(['Theuritzbacher Reinhard']);
    expect(noVehicle).toEqual([]);
    expect(params.get('ESADgrnr_20357')).toBe('5');
    expect(params.get('WARTIKEL_WAnr_20357')).toBe('46143');
    expect(params.get('action_next')).toBe('action_next');
    expect(params.get('patMultipleChoice')).toBe('true');
  });

  it('reports persons matched but without a vehicle in the EK', () => {
    const doc = personAssignmentDoc([
      {
        id: '20357',
        personName: 'Theuritzbacher Reinhard, 30.08.1983',
        funktionOptions: [['0', '-']],
        vehicleOptions: [['0', '-']],
      },
    ]);
    const assignments: CrewAssignment[] = [
      { id: 'a', name: 'Reinhard Theuritzbacher' }, // no vehicleName
    ];

    const { assigned, noVehicle } = buildPersonalAssignmentParams(
      doc,
      assignments
    );

    expect(assigned).toEqual(['Theuritzbacher Reinhard']);
    expect(noVehicle).toEqual(['Theuritzbacher Reinhard']);
  });

  it('leaves selects untouched for persons not in the EK', () => {
    const doc = personAssignmentDoc([
      {
        id: '99999',
        personName: 'Fremd Person, 01.01.1990',
        funktionOptions: [
          ['0', '-'],
          ['5', 'Gruppenkommandant'],
        ],
        vehicleOptions: [
          ['0', '-'],
          ['46143', 'RLFA 3000/100'],
        ],
      },
    ]);

    const { params, assigned } = buildPersonalAssignmentParams(doc, []);

    expect(assigned).toEqual([]);
    expect(params.get('ESADgrnr_99999')).toBe('0');
    expect(params.get('WARTIKEL_WAnr_99999')).toBe('0');
  });

  it('throws when the document has no form', () => {
    const doc = makeDoc('<div>no form here</div>');
    expect(() => buildPersonalAssignmentParams(doc, [])).toThrow(/form/i);
  });
});

// --- buildMaterialSelectionParams -----------------------------------------

describe('buildMaterialSelectionParams', () => {
  it('checks matched vehicles and reports matched/notFound', () => {
    const doc = materialSelectionDoc([
      { id: '2006', waname: 'SRF', warufname: 'Rüst Neusiedl am See' },
      { id: '46143', waname: 'RLFA 3000/100' },
    ]);
    const vehicles: FirecallVehicle[] = [
      { id: 'v1', name: 'SRF' },
      { id: 'v2', name: 'Unbekannt' },
    ];

    const { params, matched, notFound } = buildMaterialSelectionParams(
      doc,
      vehicles
    );

    expect(matched).toEqual(['SRF']);
    expect(notFound).toEqual(['Unbekannt']);
    expect(params.get('deleted[2006]')).toBe('2006');
    expect(params.has('deleted[46143]')).toBe(false);
    // Step 1 (device selection) is submitted with action_save — this is what
    // advances SYBOS to the Material edit form. action_next only re-renders
    // the selection popup, so the transfer silently saves nothing.
    expect(params.get('action_save')).toBe('action_save');
    expect(params.has('action_next')).toBe(false);
  });

  it('throws when the document has no form', () => {
    const doc = makeDoc('<div>no form here</div>');
    expect(() => buildMaterialSelectionParams(doc, [])).toThrow(/form/i);
  });
});

// --- buildMaterialAssignmentParams ----------------------------------------

describe('buildMaterialAssignmentParams', () => {
  it('serializes the form as-is with the submit markers', () => {
    const doc = makeDoc(
      '<form name="frmMain"><input type="hidden" name="amount_123" value="1"></form>'
    );

    const { params } = buildMaterialAssignmentParams(doc);

    expect(params.get('amount_123')).toBe('1');
    expect(params.get('action_next')).toBe('action_next');
    expect(params.get('patMultipleChoice')).toBe('true');
  });

  it('forces every WAESanzahl[<id>] field to 5, leaving other fields untouched', () => {
    const doc = makeDoc(
      '<form name="frmMain">' +
        '<input type="hidden" name="WAESanzahl[2004]" value="1">' +
        '<input type="hidden" name="WAESanzahl[46143]" value="99">' +
        '<input type="hidden" name="amount_123" value="1">' +
        '</form>'
    );

    const { params } = buildMaterialAssignmentParams(doc);

    expect(params.get('WAESanzahl[2004]')).toBe('5');
    expect(params.get('WAESanzahl[46143]')).toBe('5');
    expect(params.get('amount_123')).toBe('1');
  });

  it('throws when the document has no form', () => {
    const doc = makeDoc('<div>no form here</div>');
    expect(() => buildMaterialAssignmentParams(doc)).toThrow(/form/i);
  });
});
