/**
 * Put the Einsatzkarte's two report texts — „Einsatzablauf" and
 * „Tätigkeit / Bemerkung", written on the Sybos-Übertrag page — into the
 * SYBOS Einsatz form.
 *
 * Unlike Material and Mannschaft, nothing is posted here. The SYBOS detail
 * page IS the edit form (`frmEinsatzAdd`, `edit=1`), so the text areas are on
 * screen already: we fill them in place and the user saves with SYBOS's own
 * button. That way the text can be read and corrected before it is saved, and
 * a background POST plus reload cannot throw away other unsaved edits on the
 * page (captures/einsatzbericht-text.har).
 *
 * Text that is already in SYBOS and differs is a conflict: the caller asks
 * before overwriting it.
 */

/** SYBOS field names, read off the edit form. */
export const SYBOS_BERICHT_FIELDS = {
  einsatzablauf: 'ESunfallhergang',
  taetigkeit: 'ESbemerkungIntern',
} as const;

export type BerichtTextKey = keyof typeof SYBOS_BERICHT_FIELDS;

const KEYS: BerichtTextKey[] = ['einsatzablauf', 'taetigkeit'];

export type BerichtTexts = Record<BerichtTextKey, string>;

export interface BerichtTextPlan {
  /** Fields that get the Einsatzkarte text. */
  write: BerichtTextKey[];
  /** Of `write`: fields that already hold a different text in SYBOS. */
  conflicts: BerichtTextKey[];
  /** Fields where SYBOS already holds the same text. */
  unchanged: BerichtTextKey[];
  /** Fields the Einsatzkarte has no text for — left as they are. */
  empty: BerichtTextKey[];
}

function field(root: ParentNode, key: BerichtTextKey): HTMLTextAreaElement | null {
  return root.querySelector<HTMLTextAreaElement>(
    `textarea[name="${SYBOS_BERICHT_FIELDS[key]}"]`
  );
}

/** Line endings and surrounding whitespace do not make a text different. */
function normalize(text: string): string {
  return text.replace(/\r\n?/g, '\n').trim();
}

/** Is this the Einsatz form with both report text areas? */
export function hasSybosBerichtText(root: ParentNode = document): boolean {
  return KEYS.every((key) => field(root, key) !== null);
}

/** Decide per field what filling in `texts` would do. */
export function planBerichtText(root: ParentNode, texts: BerichtTexts): BerichtTextPlan {
  const plan: BerichtTextPlan = { write: [], conflicts: [], unchanged: [], empty: [] };
  for (const key of KEYS) {
    const next = normalize(texts[key] ?? '');
    const area = field(root, key);
    if (!next || !area) {
      plan.empty.push(key);
      continue;
    }
    const current = normalize(area.value);
    if (current === next) {
      plan.unchanged.push(key);
      continue;
    }
    plan.write.push(key);
    if (current) plan.conflicts.push(key);
  }
  return plan;
}

/**
 * Write `texts` into the fields named by `keys`. Fires `input` and `change`
 * like typing would, so any handler SYBOS hangs on the field (dirty marker,
 * big text editor) sees the new value.
 */
export function applyBerichtText(
  root: ParentNode,
  texts: BerichtTexts,
  keys: BerichtTextKey[]
): void {
  for (const key of keys) {
    const area = field(root, key);
    if (!area) continue;
    area.value = normalize(texts[key] ?? '');
    area.dispatchEvent(new Event('input', { bubbles: true }));
    area.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
