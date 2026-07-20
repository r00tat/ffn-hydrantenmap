/**
 * One-click transfer of the Einsatzkarte's personnel and vehicles into SYBOS.
 *
 * Both SYBOS flows are two-step: a selection popup (which persons / which
 * devices) followed by an edit form (assign vehicle+funktion / confirm
 * amounts). SYBOS has no JSON API, so we re-post its own HTML forms via
 * fetch — see `sybos-post.ts` for the low-level serialize/GET/POST helpers.
 *
 * The DOM + name/vehicle matching lives in PURE `build*Params` helpers that
 * take a fetched `Document` and return the `URLSearchParams` to post (plus a
 * summary of what matched). The `orchestrate*` functions are thin glue that
 * wire those helpers to the two GETs/POSTs and the background service worker.
 *
 * IMPORTANT SYBOS quirks:
 * - The `<form action>` is malformed (`action="&patJustContent=1"`); we NEVER
 *   post to `form.action` and always use the explicit URLs below.
 * - Only CHECKED checkboxes are serialized (their `value` is the entity id),
 *   so we flip `checkbox.checked = true` on matched rows before serializing.
 */

import {
  serializeForm,
  postForm,
  getDocument,
  findEinsatzId,
  detectError,
} from './sybos-post';
import { parseSybosPersonTable } from './sybos-table';
import { parseSybosVehicleList } from './sybos-vehicle-list';
import { parseSybosVehicleTable } from './sybos-vehicle-table';
import { findMatchingName } from './name-matching';
import { findMatchingVehicleOption } from './vehicle-matching';
import { findMatchingVehicleListRow } from './vehicle-list-matching';

const BASE = 'https://sybos.lfv-bgld.at';

/** A crew assignment from the Einsatzkarte (background `GET_CREW_ASSIGNMENTS`). */
export interface CrewAssignment {
  id: string;
  name: string;
  funktion?: string;
  vehicleName?: string;
}

/** A firecall vehicle from the Einsatzkarte (background `GET_FIRECALL_VEHICLES`). */
export interface FirecallVehicle {
  id: string;
  name: string;
}

/**
 * Summary of an orchestration run. The shape is shared between the two flows
 * for a consistent UI; the material flow only populates `matched`/`notFound`
 * (its step 2 has no per-person assignment), leaving `assigned`/`noVehicle`
 * empty.
 */
export interface OrchestrateResult {
  /** EK names/vehicles matched to a SYBOS row in the selection step. */
  matched: string[];
  /** EK names/vehicles that had no SYBOS counterpart. */
  notFound: string[];
  /** SYBOS persons a funktion/vehicle was assigned to (personal flow). */
  assigned: string[];
  /** Assigned persons that had no vehicle in the EK (personal flow). */
  noVehicle: string[];
  /** Error from `detectError` or a caught exception, if the run failed. */
  error?: string;
}

/**
 * Locate the SYBOS form to re-post. SYBOS names its main form `frmMain`; fall
 * back to the first `<form>` for fragment responses that omit the name.
 * Throws if the response contained no form at all.
 */
function findForm(doc: Document): HTMLFormElement {
  const form =
    doc.querySelector<HTMLFormElement>('form[name="frmMain"]') ??
    doc.querySelector('form');
  if (!form) {
    throw new Error('SYBOS response contained no <form> element');
  }
  return form;
}

/**
 * Step 1 of the personal flow: tick every roster person that matches an EK
 * assignment, then serialize the PersonalAuswahl popup form.
 */
export function buildPersonalSelectionParams(
  doc: Document,
  assignments: CrewAssignment[]
): { params: URLSearchParams; matched: string[]; notFound: string[] } {
  const form = findForm(doc);
  const persons = parseSybosPersonTable(doc);
  const sybosNames = persons.map((p) => p.name);

  const matched: string[] = [];
  const notFound: string[] = [];

  for (const assignment of assignments) {
    const matchedName = findMatchingName(assignment.name, sybosNames);
    const person = matchedName
      ? persons.find((p) => p.name === matchedName)
      : undefined;
    if (person) {
      person.checkbox.checked = true;
      matched.push(assignment.name);
    } else {
      notFound.push(assignment.name);
    }
  }

  const params = serializeForm(form, {
    action_next: 'action_next',
    filter: '1',
  });

  return { params, matched, notFound };
}

/**
 * Step 2 of the personal flow: on the MannschaftEinsatz edit form, set each
 * matched person's funktion and fahrzeug select, then serialize.
 */
export function buildPersonalAssignmentParams(
  doc: Document,
  assignments: CrewAssignment[]
): { params: URLSearchParams; assigned: string[]; noVehicle: string[] } {
  const form = findForm(doc);
  const rows = parseSybosVehicleTable(doc);
  const ekNames = assignments.map((a) => a.name);

  const assigned: string[] = [];
  const noVehicle: string[] = [];

  for (const row of rows) {
    const matchedEkName = findMatchingName(row.personName, ekNames);
    if (!matchedEkName) continue;

    const assignment = assignments.find((a) => a.name === matchedEkName);
    if (!assignment) continue;

    // Assign funktion by matching the option's visible text.
    if (assignment.funktion) {
      const funktionOption = Array.from(row.funktionSelect.options).find(
        (opt) => opt.text.trim() === assignment.funktion
      );
      if (funktionOption) {
        row.funktionSelect.value = funktionOption.value;
      }
    }

    // Assign fahrzeug via the fuzzy vehicle-option matcher.
    if (assignment.vehicleName) {
      const vehicleOption = findMatchingVehicleOption(
        assignment.vehicleName,
        Array.from(row.fahrzeugSelect.options)
      );
      if (vehicleOption) {
        row.fahrzeugSelect.value = vehicleOption.value;
      }
    } else {
      noVehicle.push(row.personName);
    }

    assigned.push(row.personName);
  }

  const params = serializeForm(form, {
    action_next: 'action_next',
    patMultipleChoice: 'true',
  });

  return { params, assigned, noVehicle };
}

/**
 * Step 1 of the material flow: tick every device/vehicle in the frmGeraetSelect
 * popup that matches an EK vehicle, then serialize.
 */
export function buildMaterialSelectionParams(
  doc: Document,
  vehicles: FirecallVehicle[]
): { params: URLSearchParams; matched: string[]; notFound: string[] } {
  const form = findForm(doc);
  const rows = parseSybosVehicleList(doc);

  const matched: string[] = [];
  const notFound: string[] = [];

  for (const vehicle of vehicles) {
    const row = findMatchingVehicleListRow(vehicle.name, rows);
    if (row) {
      row.checkbox.checked = true;
      matched.push(vehicle.name);
    } else {
      notFound.push(vehicle.name);
    }
  }

  const params = serializeForm(form, { action_next: 'action_next' });

  return { params, matched, notFound };
}

/**
 * Step 2 of the material flow: accept SYBOS's pre-filled amounts as-is and
 * just re-post the Material edit form with the submit markers.
 */
export function buildMaterialAssignmentParams(doc: Document): {
  params: URLSearchParams;
} {
  const form = findForm(doc);
  const params = serializeForm(form, {
    action_next: 'action_next',
    patMultipleChoice: 'true',
  });
  return { params };
}

function emptyResult(): OrchestrateResult {
  return { matched: [], notFound: [], assigned: [], noVehicle: [] };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Transfer the Einsatzkarte crew into SYBOS (two POSTs). See the module-level
 * doc for the SYBOS request contract.
 */
export async function orchestratePersonal(): Promise<OrchestrateResult> {
  const result = emptyResult();
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_CREW_ASSIGNMENTS',
    });
    if (response?.error) {
      result.error = response.error;
      return result;
    }
    const assignments: CrewAssignment[] = response?.assignments ?? [];
    if (assignments.length === 0) {
      result.error = 'Keine Mannschaft in der Einsatzkarte';
      return result;
    }

    const id = findEinsatzId();
    if (!id) {
      result.error = 'Keine Einsatz-ID gefunden';
      return result;
    }

    const selectUrl = `${BASE}/indexFrm.php?comp=sybPersonal&s=PersonalAuswahl&idParent=${id}&patJustContent=1&id=0`;
    const doc1 = await getDocument(selectUrl);
    const selection = buildPersonalSelectionParams(doc1, assignments);
    result.matched = selection.matched;
    result.notFound = selection.notFound;

    const doc2 = await postForm(selectUrl, selection.params);
    const assignment = buildPersonalAssignmentParams(doc2, assignments);
    result.assigned = assignment.assigned;
    result.noVehicle = assignment.noVehicle;

    const editUrl = `${BASE}/index.php?comp=sybEinsatz&s=MannschaftEinsatz&idParent=${id}&edit=1&id=0&patJustContent=1`;
    const doc3 = await postForm(editUrl, assignment.params);

    const error = detectError(doc3);
    if (error) result.error = error;
  } catch (err) {
    result.error = errorMessage(err);
  }
  return result;
}

/**
 * Transfer the Einsatzkarte vehicles into SYBOS (two POSTs). See the
 * module-level doc for the SYBOS request contract.
 */
export async function orchestrateMaterial(): Promise<OrchestrateResult> {
  const result = emptyResult();
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_FIRECALL_VEHICLES',
    });
    if (response?.error) {
      result.error = response.error;
      return result;
    }
    const vehicles: FirecallVehicle[] = response?.vehicles ?? [];
    if (vehicles.length === 0) {
      result.error = 'Keine Fahrzeuge in der Einsatzkarte';
      return result;
    }

    const id = findEinsatzId();
    if (!id) {
      result.error = 'Keine Einsatz-ID gefunden';
      return result;
    }

    const selectUrl = `${BASE}/indexFrm.php?comp=sybMaterial&s=frmGeraetSelect&idParent=${id}&patJustContent=1&typ=einsatz&multipleSelect=1&id=0`;
    const doc1 = await getDocument(selectUrl);
    const selection = buildMaterialSelectionParams(doc1, vehicles);
    result.matched = selection.matched;
    result.notFound = selection.notFound;

    const doc2 = await postForm(selectUrl, selection.params);
    const assignment = buildMaterialAssignmentParams(doc2);

    const editUrl = `${BASE}/indexFrm.php?comp=sybEinsatz&s=Material&patJustContent=1&edit=1&idParent=${id}&id=0`;
    const doc3 = await postForm(editUrl, assignment.params);

    const error = detectError(doc3);
    if (error) result.error = error;
  } catch (err) {
    result.error = errorMessage(err);
  }
  return result;
}
