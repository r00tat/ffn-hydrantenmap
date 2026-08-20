/**
 * Parse the lines of SYBOS's Material edit form (`s=Material`, `edit=1`) —
 * the second step of the material flow, where each selected device gets its
 * Anzahl/km value.
 *
 * The only field we can rely on is the Anzahl input itself: SYBOS names it
 * `WAESanzahl[<key>]`, one per line. What the line *is* has to be read off the
 * surrounding markup, and SYBOS is not consistent about it — the display name
 * may sit in a `name_tbl[deleted[<key>]]` hidden field (the pattern the
 * personnel table uses, see `sybos-table.ts`), in a `WAname`-ish field of the
 * same row, or only as text in one of the row's cells.
 *
 * Therefore a line carries a LIST of name candidates instead of one name, most
 * reliable first, and the caller decides which one matches an Einsatzkarte
 * vehicle. A candidate that means nothing simply matches nothing — whereas
 * guessing a single name would silently write kilometres onto the wrong line.
 */

/** Matches the "Anzahl"/km field SYBOS renders per material line. */
const WAES_ANZAHL_PATTERN = /^WAESanzahl\[(\d+)\]$/;

/**
 * SYBOS ships its grid templates with unsubstituted placeholders; the vehicle
 * list's name field is the known one (see `parseSybosPersonTable`).
 */
const NAME_PLACEHOLDER_PATTERN = /^\{[A-Za-z]+\}$/;

/** Row fields whose name suggests they carry the device's display name. */
const NAME_FIELD_PATTERN = /wa(name|bez|rufname)/i;

export interface SybosMaterialLine {
  /** The `<key>` from `WAESanzahl[<key>]` — SYBOS's device/line id. */
  key: string;
  /** The form field to set, e.g. `WAESanzahl[2004]`. */
  field: string;
  /**
   * Candidates for this line's device name, most reliable first. Empty when
   * the form carries no name at all for the line.
   */
  names: string[];
}

function clean(value: string | null | undefined): string {
  const trimmed = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  if (NAME_PLACEHOLDER_PATTERN.test(trimmed)) return '';
  return trimmed;
}

/**
 * Name candidates from the row's own fields and cell texts.
 *
 * Cell texts are read per `<td>`, not from the row as a whole: the row's
 * `textContent` would glue the device name to whatever else stands in the line
 * and match nothing.
 */
function rowCandidates(row: Element): string[] {
  const candidates: string[] = [];

  for (const field of row.querySelectorAll<
    HTMLInputElement | HTMLSelectElement
  >('input, select')) {
    if (!NAME_FIELD_PATTERN.test(field.name)) continue;
    candidates.push(clean(field.value));
  }

  const cells = row.querySelectorAll('td, th');
  for (const cell of cells) {
    // A cell that holds the inputs contributes their values, not a label.
    if (cell.querySelector('input, select, textarea')) continue;
    candidates.push(clean(cell.textContent));
  }

  if (cells.length === 0) candidates.push(clean(row.textContent));

  return candidates;
}

/**
 * Parse every material line of `root`. Lines keep the document order of their
 * Anzahl fields, which is the order SYBOS renders them in.
 */
export function parseSybosMaterialLines(
  root: ParentNode = document
): SybosMaterialLine[] {
  const lines: SybosMaterialLine[] = [];

  for (const input of root.querySelectorAll<HTMLInputElement>(
    'input[name^="WAESanzahl["]'
  )) {
    const match = input.name.match(WAES_ANZAHL_PATTERN);
    const key = match?.[1];
    if (!key) continue;

    const names: string[] = [];

    // The hidden name field SYBOS keys by the same id — the one candidate that
    // does not depend on where the input sits in the markup.
    const nameField = root.querySelector<HTMLInputElement>(
      `input[name="name_tbl[deleted[${key}]]"]`
    );
    names.push(clean(nameField?.value));

    const row = input.closest('tr');
    if (row) names.push(...rowCandidates(row));

    lines.push({
      key,
      field: input.name,
      names: [...new Set(names.filter(Boolean))],
    });
  }

  return lines;
}
