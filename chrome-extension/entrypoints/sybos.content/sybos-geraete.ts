/**
 * Transfer the Einsatzkarte's Geräte and Verbrauchsmaterial into SYBOS.
 *
 * Same two SYBOS forms as the vehicle transfer (`sybos-orchestrate.ts`): the
 * frmGeraetSelect popup, then the Material edit form. What differs, read off
 * captures/add-geraete-2.har:
 *
 * - Articles are matched by their Sybos ID, not by name. The Geräte import
 *   keeps Sybos's article ID (`externeId`), and the popup row id is the same
 *   WA id — no guessing involved.
 * - The popup shows ONE list type at a time („Listenauswahl": Gerät,
 *   Container, Bekleidung, … twelve in all). The visible `<select>` has no
 *   name; a jQuery multiselect copies its value into the hidden
 *   `frmListeListSelect`. We pick the list by matching the option labels
 *   against the article's Sybos `Kategorie`, which uses the same words.
 * - Lists are paged by 100 („(1 - 100 von 294)"); the next page is the same
 *   form re-posted with `BListFrom=100`.
 * - With `filter=1` („Bereits hinzugefügte Geräte nicht anzeigen") an article
 *   drops out of the list once it is on the Einsatz. So after saving the
 *   matches of a page we load that same offset again — the rows behind it
 *   have moved up.
 */

import { serializeForm, postForm, getDocument, findEinsatzId, detectError } from './sybos-post';
import { parseSybosMaterialLines } from './sybos-material-table';
import { parseMultiselectData } from './sybos-multiselect';
import type { SybosGeraetLine } from '@shared/types';

const BASE = 'https://sybos.lfv-bgld.at';

/** The list SYBOS shows when an article has no Kategorie we could match. */
export const DEFAULT_LIST_TYPE = 'gerae';

/**
 * Upper bound on popup requests per list type. A list of 294 Geräte is three
 * pages; this only stops a loop if SYBOS ever answers with the same page.
 */
const MAX_LIST_REQUESTS = 30;

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
  /** Things worth checking by hand. */
  warnings: string[];
  error?: string;
}

export interface SybosListType {
  code: string;
  label: string;
}

function findForm(doc: Document): HTMLFormElement {
  const form =
    doc.querySelector<HTMLFormElement>('form[name="frmMain"]') ??
    doc.querySelector('form');
  if (!form) {
    throw new Error('SYBOS response contained no <form> element');
  }
  return form;
}

function normalizeLabel(text: string | undefined): string {
  return (text ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** The list types the popup offers („Listenauswahl"). */
export function parseListTypes(doc: Document): SybosListType[] {
  const select = doc.querySelector<HTMLSelectElement>('select#frmListeListSelect');
  if (!select) return [];
  return Array.from(select.options)
    .filter((option) => option.value)
    .map((option) => ({ code: option.value, label: (option.textContent ?? '').trim() }));
}

/**
 * The list an article is found in: the type whose label is its Kategorie,
 * else the Geräte list. `null` when the popup offers neither.
 */
export function listTypeFor(types: SybosListType[], kategorie: string | undefined): string | null {
  const wanted = normalizeLabel(kategorie);
  const byLabel = wanted ? types.find((type) => normalizeLabel(type.label) === wanted) : undefined;
  if (byLabel) return byLabel.code;
  return types.some((type) => type.code === DEFAULT_LIST_TYPE) ? DEFAULT_LIST_TYPE : null;
}

/**
 * Params that show list `code` from row `offset` on — what the popup posts
 * when the list type changes or „weiter" is clicked. No submit marker: SYBOS
 * answers with the re-rendered list. The class filters and the search are
 * reset, they belong to the previous list; `filter=1` hides articles already
 * on the Einsatz.
 */
export function buildListPageParams(doc: Document, code: string, offset: number): URLSearchParams {
  return serializeForm(findForm(doc), {
    frmListeListSelect: code,
    BListFrom: offset > 0 ? String(offset) : '',
    filter: '1',
    frmListeListAnf: '',
    LstWAG1WAGnr: '0',
    LstWAG2WAGnr: null,
    LstWAG3WAGnr: null,
  });
}

/** The range SYBOS prints above a list, e.g. „(1 - 100 von 294)". */
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
): { params: URLSearchParams; matchedIds: string[] } {
  const form = findForm(doc);
  const rows = parseMultiselectData(doc);
  // Like the vehicle flow: only `action_save` advances to the edit form.
  const params = serializeForm(form, { action_save: 'action_save' });

  const wanted = new Set(lines.map((line) => line.sybosId));
  const matchedIds: string[] = [];
  for (const row of rows) {
    for (const field of row.hiddenFields) {
      params.append(field.name, field.value);
    }
    if (row.id && wanted.has(row.id) && row.checkboxName) {
      params.append(row.checkboxName, row.checkboxValue);
      matchedIds.push(row.id);
    }
  }
  return { params, matchedIds };
}

/** SYBOS takes whole numbers only; anything used counts at least once. */
export function sybosAnzahl(value: number): number {
  if (!(value > 0)) return 0;
  return Math.max(1, Math.round(value));
}

/**
 * Step 2: write each article's Anzahl into its line. Lines of other articles
 * stay as SYBOS pre-filled them.
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

/** Group the lines by the popup list they are found in. */
export function groupByListType(
  types: SybosListType[],
  lines: SybosGeraetLine[]
): { byType: Map<string, SybosGeraetLine[]>; unlisted: SybosGeraetLine[] } {
  const byType = new Map<string, SybosGeraetLine[]>();
  const unlisted: SybosGeraetLine[] = [];
  for (const line of lines) {
    const code = listTypeFor(types, line.kategorie);
    if (!code) {
      unlisted.push(line);
      continue;
    }
    const list = byType.get(code);
    if (list) list.push(line);
    else byType.set(code, [line]);
  }
  return { byType, unlisted };
}

function selectUrlFor(einsatzId: string): string {
  return `${BASE}/indexFrm.php?comp=sybMaterial&s=frmGeraetSelect&idParent=${einsatzId}&patJustContent=1&typ=einsatz&multipleSelect=1&id=0`;
}

/** Load list `code` from `offset` on, starting from a fresh popup. */
async function openList(einsatzId: string, code: string, offset: number): Promise<Document> {
  const url = selectUrlFor(einsatzId);
  const popup = await getDocument(url);
  return postForm(url, buildListPageParams(popup, code, offset));
}

/** Save the ticked rows of `page`: selection, then the Anzahl form. */
async function saveSelection(
  einsatzId: string,
  page: Document,
  lines: SybosGeraetLine[],
  result: GeraeteResult
): Promise<string[]> {
  const selection = buildGeraeteSelectionParams(page, lines);
  if (selection.matchedIds.length === 0) return [];

  const editForm = await postForm(selectUrlFor(einsatzId), selection.params);
  const assignment = buildGeraeteAssignmentParams(editForm, lines);
  result.amounts.push(...assignment.amounts);

  const editUrl = `${BASE}/indexFrm.php?comp=sybEinsatz&s=Material&patJustContent=1&edit=1&idParent=${einsatzId}&id=0`;
  const saved = await postForm(editUrl, assignment.params);
  const error = detectError(saved);
  if (error) throw new Error(error);
  return selection.matchedIds;
}

/**
 * Walk list `code` page by page and save the matches of each page. Returns
 * the lines that were not in the list.
 */
async function transferList(
  einsatzId: string,
  code: string,
  lines: SybosGeraetLine[],
  result: GeraeteResult
): Promise<SybosGeraetLine[]> {
  let remaining = lines;
  let offset = 0;
  let page = await openList(einsatzId, code, offset);

  for (let request = 1; remaining.length > 0; request++) {
    if (request > MAX_LIST_REQUESTS) {
      result.warnings.push('Geräteauswahl nicht vollständig durchsucht — bitte prüfen');
      break;
    }

    const savedIds = await saveSelection(einsatzId, page, remaining, result);
    if (savedIds.length > 0) {
      const saved = new Set(savedIds);
      result.matched.push(...remaining.filter((l) => saved.has(l.sybosId)).map((l) => l.name));
      remaining = remaining.filter((l) => !saved.has(l.sybosId));
      if (remaining.length === 0) break;
      // The saved rows left the list; the next ones moved up to this offset.
      page = await openList(einsatzId, code, offset);
      continue;
    }

    const range = parseListRange(page);
    if (!range || range.to >= range.total) break;
    offset = range.to;
    page = await postForm(selectUrlFor(einsatzId), buildListPageParams(page, code, offset));
  }
  return remaining;
}

/** Transfer the Einsatzkarte's Geräte into SYBOS, one popup list at a time. */
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

    const types = parseListTypes(await getDocument(selectUrlFor(einsatzId)));
    const { byType, unlisted } = groupByListType(types, lines);
    result.notFound.push(...unlisted.map((line) => line.name));

    for (const [code, ofType] of byType) {
      const missing = await transferList(einsatzId, code, ofType, result);
      result.notFound.push(...missing.map((line) => line.name));
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }
  return result;
}
