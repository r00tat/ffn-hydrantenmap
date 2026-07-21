/**
 * Parse SYBOS's `frmGeraetSelect` (and similar) multiselect popups from the
 * FETCHED HTML, before any client-side JS has run.
 *
 * SYBOS renders these popups as an ExtJS grid, but the actual row data is
 * shipped as a plain JS array assigned to `var myData = [ ... ];` inside a
 * `<script>` tag; ExtJS then builds the `.x-grid3-*` DOM from it client-side.
 * Since we fetch the HTML with `fetch()` (no JS execution), that rendered
 * grid never exists — so we read `myData` directly instead of scraping DOM
 * that was never built. See `sybos-vehicle-list.ts` for the DOM-based parser
 * used by the live popup (still needed there, since the JS *has* run there).
 *
 * Each `myData` row is an 8-element array; the fields we care about are:
 * - row[0]: an HTML string containing the row's hidden `<input>`s (the id/
 *   name scaffolding SYBOS expects back on submit) and its selection
 *   `<input type="checkbox" name="deleted[<id>]">`.
 * - row[1]: WAname (display name).
 * - row[6]: Kurzbezeichnung / rufname (may be `""`).
 */

import { parseHtml } from './sybos-post';

/** A single row parsed out of a SYBOS multiselect popup's `myData` array. */
export interface MultiselectRow {
  id: string;
  waname: string;
  rufname: string;
  checkboxName: string | null;
  checkboxValue: string;
  hiddenFields: Array<{ name: string; value: string }>;
}

/** Matches `var myData = [[...], [...]];` across the whole document/script text. */
const MYDATA_PATTERN = /var myData\s*=\s*(\[[\s\S]*\]\])\s*;/;

/** Extract the row id from a `deleted[<id>]`-style checkbox name. */
const CHECKBOX_ID_PATTERN = /\[(\d+)\]/;

/**
 * Parse `row[0]`'s HTML fragment into its hidden inputs and selection
 * checkbox.
 */
function parseRowHtml(html: string): {
  hiddenFields: Array<{ name: string; value: string }>;
  checkboxName: string | null;
  checkboxValue: string;
} {
  const rowDoc = parseHtml(html);

  const hiddenFields = Array.from(
    rowDoc.querySelectorAll<HTMLInputElement>('input[type="hidden"]')
  ).map((input) => ({ name: input.name, value: input.value }));

  const checkbox = rowDoc.querySelector<HTMLInputElement>(
    'input[type="checkbox"]'
  );

  return {
    hiddenFields,
    checkboxName: checkbox?.name ?? null,
    checkboxValue: checkbox?.value ?? '',
  };
}

/**
 * Derive the row's entity id, preferring the checkbox name's `[<id>]`
 * suffix (`deleted[57738]` -> `"57738"`) and falling back to the row's
 * `id_tbl[<id>]` hidden field for rows that have no checkbox.
 */
function deriveRowId(
  checkboxName: string | null,
  hiddenFields: Array<{ name: string; value: string }>
): string {
  if (checkboxName) {
    const match = checkboxName.match(CHECKBOX_ID_PATTERN);
    if (match) return match[1];
  }

  const idField = hiddenFields.find((field) => field.name.startsWith('id_tbl['));
  return idField?.value ?? '';
}

/** Parse a single `myData` row (already JSON-parsed) into a `MultiselectRow`. */
function parseRow(row: unknown[]): MultiselectRow | null {
  if (typeof row[0] !== 'string') return null;

  const { hiddenFields, checkboxName, checkboxValue } = parseRowHtml(row[0]);
  const waname = typeof row[1] === 'string' ? row[1] : '';
  const rufname = typeof row[6] === 'string' ? row[6] : '';

  return {
    id: deriveRowId(checkboxName, hiddenFields),
    waname,
    rufname,
    checkboxName,
    checkboxValue,
    hiddenFields,
  };
}

/**
 * Find and parse the `var myData = [...];` array from `doc`'s `<script>`
 * tags (falling back to the full serialized document, in case the script
 * text wasn't picked up as expected). Returns `[]` if no array is found or
 * it fails to parse as JSON — SYBOS's `myData` is valid JSON (double-quoted
 * strings with `\/` and `\uXXXX` escapes), so a plain `JSON.parse` suffices.
 */
export function parseMultiselectData(doc: Document): MultiselectRow[] {
  try {
    const scripts = Array.from(doc.querySelectorAll('script'));
    let match: RegExpMatchArray | null = null;

    for (const script of scripts) {
      match = script.textContent?.match(MYDATA_PATTERN) ?? null;
      if (match) break;
    }

    if (!match) {
      match = doc.documentElement.outerHTML.match(MYDATA_PATTERN);
    }

    if (!match) return [];

    const rows = JSON.parse(match[1]);
    if (!Array.isArray(rows)) return [];

    const parsed: MultiselectRow[] = [];
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      const parsedRow = parseRow(row);
      if (parsedRow) parsed.push(parsedRow);
    }
    return parsed;
  } catch {
    return [];
  }
}

/**
 * Check whether `row` corresponds to the Einsatzkarte vehicle named
 * `ekName`. Matching rules (case-insensitive, trimmed):
 *   1. `row.waname` exact match.
 *   2. `row.rufname` exact match (only when non-empty).
 *   3. `row.waname` starts with `ekName + ' '` — handles SYBOS names that
 *      carry a location suffix (e.g. "WLF-K Neusiedl am See" vs EK "WLF-K").
 * Empty `ekName` always returns `false`.
 */
export function matchesVehicleName(ekName: string, row: MultiselectRow): boolean {
  const normalized = ekName.trim().toLowerCase();
  if (!normalized) return false;

  const waname = row.waname.trim().toLowerCase();
  if (waname === normalized) return true;

  const rufname = row.rufname.trim().toLowerCase();
  if (rufname && rufname === normalized) return true;

  if (waname.startsWith(`${normalized} `)) return true;

  return false;
}
