/**
 * Transfer the Einsatzkarte's Geräte and Verbrauchsmaterial into SYBOS.
 *
 * Same two SYBOS forms as the vehicle transfer (`sybos-orchestrate.ts`): the
 * frmGeraetSelect popup, then the Material edit form. Two differences:
 *
 * - Articles are matched by their Sybos ID, not by name. The Geräte import
 *   keeps Sybos's article ID (`externeId`), and the popup row id is the same
 *   WA id (captures/add-geraete-1.har) — no guessing involved.
 * - The popup lists one article type at a time (`frmListeListSelect`:
 *   `fuhrp` Fahrzeuge, `gerae` Geräte, `cont` Container). We switch the list
 *   to the type first by re-posting the popup with the new filter, just as
 *   its `onchange` submit does.
 *
 * NOT VERIFIED against a recording: the filter post for `gerae`/`cont` and
 * whether the list pages. The code is defensive about both — it only switches
 * when the option exists, reports a list that shows „(1 - 50 von 1099)" as
 * incomplete, and lists every article it did not find instead of failing.
 */

import { serializeForm, postForm, getDocument, findEinsatzId, detectError } from './sybos-post';
import { parseSybosMaterialLines } from './sybos-material-table';
import { parseMultiselectData } from './sybos-multiselect';
import type { SybosGeraetLine, SybosGeraetTyp } from '@shared/types';

const BASE = 'https://sybos.lfv-bgld.at';

/** What was written into one line's Anzahl field. */
export interface GeraetLineAmount {
  label: string;
  /** The whole number written into SYBOS. */
  anzahl?: number;
  einheit?: 'stk' | 'h';
  /** The Einsatzkarte value, when it had to be rounded to `anzahl`. */
  gerundet?: number;
  /** Set when the line was left as SYBOS pre-filled it. */
  missing?: 'noAmount';
}

export interface GeraeteResult {
  matched: string[];
  notFound: string[];
  amounts: GeraetLineAmount[];
  /** Things worth checking by hand, e.g. a list that SYBOS shows paged. */
  warnings: string[];
  error?: string;
}

const TYP_LABELS: Record<SybosGeraetTyp, string> = {
  gerae: 'Geräte',
  cont: 'Container',
};

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
 * Params that switch the popup list to `typ`, or `null` when there is nothing
 * to switch — the list already shows the type, or SYBOS offers no such filter.
 * No submit marker: the popup's own `onchange` submits plainly and SYBOS
 * answers with the re-rendered list.
 */
export function buildGeraeteFilterParams(
  doc: Document,
  typ: SybosGeraetTyp
): URLSearchParams | null {
  const form = doc.querySelector<HTMLFormElement>('form[name="frmMain"]') ?? doc.querySelector('form');
  const select = form?.querySelector<HTMLSelectElement>('select[name="frmListeListSelect"]');
  if (!form || !select) return null;
  if (!Array.from(select.options).some((option) => option.value === typ)) return null;
  if (select.value === typ) return null;
  return serializeForm(form, { frmListeListSelect: typ });
}

/** The range SYBOS prints above a list, e.g. „(1 - 50 von 1099)". */
export function parseListRange(
  doc: Document
): { from: number; to: number; total: number } | null {
  const match = /\((\d+)\s*-\s*(\d+)\s+von\s+(\d+)\)/.exec(doc.body?.textContent ?? '');
  if (!match) return null;
  return { from: Number(match[1]), to: Number(match[2]), total: Number(match[3]) };
}

/**
 * Step 1: tick every popup row whose id is the Sybos ID of an Einsatzkarte
 * article. The hidden fields of all rows go along, as in the vehicle flow.
 */
export function buildGeraeteSelectionParams(
  doc: Document,
  lines: SybosGeraetLine[]
): { params: URLSearchParams; matched: string[]; notFound: string[] } {
  const form = findForm(doc);
  const rows = parseMultiselectData(doc);
  // Like the vehicle flow: only `action_save` advances to the edit form.
  const params = serializeForm(form, { action_save: 'action_save' });

  const wanted = new Set(lines.map((line) => line.sybosId));
  const found = new Set<string>();
  for (const row of rows) {
    for (const field of row.hiddenFields) {
      params.append(field.name, field.value);
    }
    if (row.id && wanted.has(row.id) && row.checkboxName) {
      params.append(row.checkboxName, row.checkboxValue);
      found.add(row.id);
    }
  }

  const matched: string[] = [];
  const notFound: string[] = [];
  for (const line of lines) {
    (found.has(line.sybosId) ? matched : notFound).push(line.name);
  }
  return { params, matched, notFound };
}

/** SYBOS takes whole numbers only; anything used counts at least once. */
export function sybosAnzahl(value: number): number {
  if (!(value > 0)) return 0;
  return Math.max(1, Math.round(value));
}

/**
 * Step 2: write each article's Anzahl into its line. Lines of other articles —
 * vehicles, or Geräte already on the Einsatz — stay as SYBOS pre-filled them.
 */
export function buildGeraeteAssignmentParams(
  doc: Document,
  lines: SybosGeraetLine[]
): { params: URLSearchParams; amounts: GeraetLineAmount[] } {
  const form = findForm(doc);
  const params = serializeForm(form, {
    action_next: 'action_next',
    patMultipleChoice: 'true',
  });

  const byId = new Map(lines.map((line) => [line.sybosId, line]));
  const amounts: GeraetLineAmount[] = [];

  for (const formLine of parseSybosMaterialLines(form)) {
    const line = byId.get(formLine.key);
    if (!line || !params.has(formLine.field)) continue;

    if (line.anzahl === undefined || sybosAnzahl(line.anzahl) === 0) {
      amounts.push({ label: line.name, missing: 'noAmount' });
      continue;
    }
    const anzahl = sybosAnzahl(line.anzahl);
    params.set(formLine.field, String(anzahl));
    const amount: GeraetLineAmount = { label: line.name, anzahl, einheit: line.einheit };
    if (anzahl !== line.anzahl) amount.gerundet = line.anzahl;
    amounts.push(amount);
  }

  return { params, amounts };
}

/** Run the two SYBOS steps for the articles of one type. */
async function transferTyp(
  einsatzId: string,
  typ: SybosGeraetTyp,
  lines: SybosGeraetLine[],
  result: GeraeteResult
): Promise<void> {
  const selectUrl = `${BASE}/indexFrm.php?comp=sybMaterial&s=frmGeraetSelect&idParent=${einsatzId}&patJustContent=1&typ=einsatz&multipleSelect=1&id=0`;
  let list = await getDocument(selectUrl);
  const filter = buildGeraeteFilterParams(list, typ);
  if (filter) list = await postForm(selectUrl, filter);

  const range = parseListRange(list);
  if (range && range.to < range.total) {
    result.warnings.push(
      `SYBOS zeigt nur ${range.from}–${range.to} von ${range.total} ${TYP_LABELS[typ]} — fehlende bitte von Hand auswählen`
    );
  }

  const selection = buildGeraeteSelectionParams(list, lines);
  result.matched.push(...selection.matched);
  result.notFound.push(...selection.notFound);
  if (selection.matched.length === 0) return;

  const editForm = await postForm(selectUrl, selection.params);
  const assignment = buildGeraeteAssignmentParams(editForm, lines);
  result.amounts.push(...assignment.amounts);

  const editUrl = `${BASE}/indexFrm.php?comp=sybEinsatz&s=Material&patJustContent=1&edit=1&idParent=${einsatzId}&id=0`;
  const saved = await postForm(editUrl, assignment.params);
  const error = detectError(saved);
  if (error) throw new Error(error);
}

/** Transfer the Einsatzkarte's Geräte into SYBOS, Geräte first, then Container. */
export async function orchestrateGeraete(): Promise<GeraeteResult> {
  const result: GeraeteResult = { matched: [], notFound: [], amounts: [], warnings: [] };
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_FIRECALL_GERAETE' });
    if (response?.error) {
      result.error = response.error;
      return result;
    }
    const lines: SybosGeraetLine[] = response?.geraete ?? [];
    if (lines.length === 0) {
      result.error = 'Keine Geräte in der Einsatzkarte';
      return result;
    }

    const einsatzId = findEinsatzId();
    if (!einsatzId) {
      result.error = 'Keine Einsatz-ID gefunden';
      return result;
    }

    for (const typ of ['gerae', 'cont'] as const) {
      const ofTyp = lines.filter((line) => line.typ === typ);
      if (ofTyp.length > 0) await transferTyp(einsatzId, typ, ofTyp, result);
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }
  return result;
}
