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
  findPersonalAuswahlToken,
  detectError,
} from './sybos-post';
import { parseSybosVehicleTable } from './sybos-vehicle-table';
import { findMatchingName } from './name-matching';
import { findMatchingVehicleOption } from './vehicle-matching';
import { parseMultiselectData, matchesVehicleName } from './sybos-multiselect';

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
 *
 * Like the material popup, the roster is an ExtJS grid whose rows only exist
 * after client-side JS runs; since we fetch the HTML, the rows ship as a
 * `var myData = [...]` array instead (see `sybos-multiselect.ts`). Each row's
 * HTML holds the hidden id scaffolding SYBOS expects back plus a
 * `selected[<id>]` checkbox. We append every row's hidden fields and add the
 * `selected[<id>]` marker only for matched persons — there is no rendered
 * checkbox element to flip. Person rows use `row[1]` as the display name
 * (matched via {@link findMatchingName}).
 *
 * `token` is the PersonalAuswahl `q` value scraped from the detail page; the
 * submit re-sends it (SYBOS echoes it through both popup steps).
 */
export function buildPersonalSelectionParams(
  doc: Document,
  assignments: CrewAssignment[],
  token?: string | null
): { params: URLSearchParams; matched: string[]; notFound: string[] } {
  const form = findForm(doc);
  const rows = parseMultiselectData(doc);
  const params = serializeForm(form, {
    action_next: 'action_next',
    filter: '1',
  });
  if (token) params.set('q', token);

  // SYBOS expects the full roster's id scaffolding back on submit.
  for (const row of rows) {
    for (const field of row.hiddenFields) {
      params.append(field.name, field.value);
    }
  }

  const rosterNames = rows.map((row) => row.waname);
  const matched: string[] = [];
  const notFound: string[] = [];
  const markedIds = new Set<string>();

  for (const assignment of assignments) {
    const matchedName = findMatchingName(assignment.name, rosterNames);
    const row = matchedName
      ? rows.find((r) => r.waname === matchedName)
      : undefined;
    if (row?.checkboxName) {
      if (!markedIds.has(row.id)) {
        params.append(row.checkboxName, row.checkboxValue);
        markedIds.add(row.id);
      }
      matched.push(assignment.name);
    } else {
      notFound.push(assignment.name);
    }
  }

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
 * Step 1 of the material flow: tick every device/vehicle in the
 * frmGeraetSelect popup that matches an EK vehicle, then serialize.
 *
 * The popup's rows are ExtJS grid rows that only exist in the DOM after
 * client-side JS renders them — since we fetch the HTML instead of
 * navigating to it, that JS never runs. The actual row data ships as a plain
 * JS array (`var myData = [...]`) inside a `<script>` tag instead; see
 * `sybos-multiselect.ts` for the parser. Because there's no rendered
 * checkbox element to flip, we append each matched row's hidden fields and
 * checkbox field to `params` directly rather than mutating the (nonexistent)
 * DOM.
 */
export function buildMaterialSelectionParams(
  doc: Document,
  vehicles: FirecallVehicle[]
): { params: URLSearchParams; matched: string[]; notFound: string[] } {
  const form = findForm(doc);
  const rows = parseMultiselectData(doc);
  // SYBOS advances the selection popup to the Material edit form only on the
  // `action_save` submit marker; `action_next` merely re-renders the popup,
  // so the second POST would serialize the selection form again and save
  // nothing (HTTP 200, no error → silently lost). Verified against a real
  // browser submit (captures/add-material.har).
  const params = serializeForm(form, { action_save: 'action_save' });

  const matchedVehicleNames = new Set<string>();

  for (const row of rows) {
    for (const field of row.hiddenFields) {
      params.append(field.name, field.value);
    }

    const matchingVehicles = vehicles.filter((vehicle) =>
      matchesVehicleName(vehicle.name, row)
    );
    if (matchingVehicles.length > 0 && row.checkboxName) {
      params.append(row.checkboxName, row.checkboxValue);
    }
    for (const vehicle of matchingVehicles) {
      matchedVehicleNames.add(vehicle.name);
    }
  }

  const matched: string[] = [];
  const notFound: string[] = [];
  for (const vehicle of vehicles) {
    if (matchedVehicleNames.has(vehicle.name)) {
      matched.push(vehicle.name);
    } else {
      notFound.push(vehicle.name);
    }
  }

  return { params, matched, notFound };
}

/** Matches the "Anzahl"/km field SYBOS renders per material line. */
const WAES_ANZAHL_PATTERN = /^WAESanzahl\[\d+\]$/;

/** The default km/Anzahl value we force onto every material line. */
const DEFAULT_MATERIAL_ANZAHL = '5';

/**
 * Step 2 of the material flow: re-post the Material edit form with the
 * submit markers, forcing every material line's Anzahl/km field to
 * {@link DEFAULT_MATERIAL_ANZAHL} rather than trusting SYBOS's pre-filled
 * value.
 */
export function buildMaterialAssignmentParams(doc: Document): {
  params: URLSearchParams;
} {
  const form = findForm(doc);
  const params = serializeForm(form, {
    action_next: 'action_next',
    patMultipleChoice: 'true',
  });

  const anzahlKeys = new Set(
    Array.from(params.keys()).filter((key) => WAES_ANZAHL_PATTERN.test(key))
  );
  for (const key of anzahlKeys) {
    params.set(key, DEFAULT_MATERIAL_ANZAHL);
  }

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

    // The roster popup is loaded by POSTing the detail page's `q` token to
    // index.php (a GET answers "Parameter fehlt"). The token is baked into the
    // detail page's syfPopupPersonalAuswahl() JS.
    const token = findPersonalAuswahlToken();
    if (!token) {
      result.error = 'Personal-Token nicht gefunden';
      return result;
    }

    const rosterUrl = `${BASE}/index.php?comp=sybPersonal&s=PersonalAuswahl&patJustContent=1`;
    const rosterParams = new URLSearchParams();
    rosterParams.set('q', token);
    const doc1 = await postForm(rosterUrl, rosterParams);

    const selection = buildPersonalSelectionParams(doc1, assignments, token);
    result.matched = selection.matched;
    result.notFound = selection.notFound;

    // The selection form submits to the idParent-scoped indexFrm endpoint; its
    // response is the MannschaftEinsatz edit form.
    const selectUrl = `${BASE}/indexFrm.php?comp=sybPersonal&s=PersonalAuswahl&idParent=${id}&patJustContent=1&id=0`;
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
