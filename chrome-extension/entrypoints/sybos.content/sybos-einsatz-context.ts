/**
 * Read what the currently open SYBOS page says about *its* Einsatz — date,
 * beginning, Einsatzstichwort, Einsatzart and Einsatzort.
 *
 * This is the counterpart to the Einsatz selected in the panel: knowing both
 * sides is what lets `firecall-matching.ts` tell whether the user is about to
 * transfer crew and material into the wrong SYBOS Einsatzbericht.
 *
 * SYBOS renders its forms through PAT, which gives us no stable field ids to
 * key off — the same logical field can arrive as `EINSATZ_ESbez` in one
 * release and under a different name in the next. Scraping therefore goes by
 * the *label* a human reads (left table cell, or `<label for>`), with the
 * field name as a second, weaker source. Anything we cannot read stays `null`
 * rather than being guessed: a wrong context would produce exactly the false
 * warning this feature exists to avoid.
 */

import { findEinsatzId } from './sybos-post';

export interface SybosEinsatzContext {
  /** SYBOS Einsatz id, when the page exposes one (see `findEinsatzId`). */
  einsatzId: string | null;
  /** Beginning of the SYBOS Einsatz, local time. */
  start: Date | null;
  /** True when only a date was readable, so `start` is that day's midnight. */
  dateOnly: boolean;
  /** Einsatzstichwort / Bezeichnung. */
  title: string | null;
  /** Einsatzart as displayed (e.g. "Brandeinsatz"). */
  einsatzart: string | null;
  /** Einsatzort / address. */
  ort: string | null;
}

/** Label patterns, checked against the text a human sees next to the field. */
const LABEL_PATTERNS = {
  date: /(^|\b)(einsatz)?datum\b|alarmdatum/i,
  time: /beginn|alarmzeit|alarmierung|uhrzeit|startzeit|^alarm\b/i,
  title: /stichwort|bezeichnung|einsatztitel|^titel\b|einsatzname/i,
  einsatzart: /einsatzart|einsatztyp|art des einsatzes|einsatzkategorie/i,
  ort: /^(einsatz)?(ort|adresse|straße|strasse)\b/i,
} as const;

/**
 * Field-name patterns, used only when the label gave nothing. SYBOS names
 * follow a `<TABLE>_<COLUMN>` scheme (`EINSATZ_ESnr`, `EINSATZART_EAnr`).
 */
const NAME_PATTERNS = {
  date: /^(einsatz|es).*dat/i,
  time: /^(einsatz|es).*(beg|zeit)/i,
  title: /^(einsatz|es).*(bez|stich)/i,
  einsatzart: /einsatzart|eanr/i,
  ort: /^(einsatz|es).*(ort|adr|str)/i,
} as const;

type ContextKey = keyof typeof LABEL_PATTERNS;

const CONTEXT_KEYS: ContextKey[] = ['date', 'time', 'title', 'einsatzart', 'ort'];

/** Select entries that mean "nothing chosen" and must not become a value. */
const PLACEHOLDER_OPTION = /^[-–\s]*$|bitte\s+(aus)?w[äa]hlen|^ausw[äa]hlen|keine\s+auswahl/i;

const GERMAN_DATE = /(\d{1,2})\.(\d{1,2})\.(\d{2,4})/;
const ISO_DATE = /(\d{4})-(\d{1,2})-(\d{1,2})/;
const CLOCK_TIME = /(\d{1,2}):(\d{2})/;

/** Text of an element, ignoring cells that are really controls, not labels. */
function labelCellText(element: Element): string {
  if (element.querySelector('input, select, textarea')) return '';
  return (element.textContent || '').replace(/\s+/g, ' ').trim();
}

/**
 * The label a user reads for `field`: an explicit `<label for>` first, then
 * the preceding cell of the same table row (how PAT lays out its forms), then
 * a preceding label-ish sibling.
 */
function labelTextFor(field: Element, root: Document): string {
  const id = field.getAttribute('id');
  if (id) {
    for (const label of Array.from(root.querySelectorAll('label[for]'))) {
      if (label.getAttribute('for') === id) {
        const text = labelCellText(label);
        if (text) return text;
      }
    }
  }

  const cell = field.closest('td, th');
  if (cell) {
    for (
      let prev = cell.previousElementSibling;
      prev;
      prev = prev.previousElementSibling
    ) {
      const text = labelCellText(prev);
      if (text) return text;
    }
  }

  for (
    let prev = field.previousElementSibling;
    prev;
    prev = prev.previousElementSibling
  ) {
    if (!/^(label|span|b|strong|div|td)$/i.test(prev.tagName)) break;
    const text = labelCellText(prev);
    if (text) return text;
  }

  return '';
}

/** The value a user sees in `field`, or null when it carries nothing. */
function fieldValue(field: Element): string | null {
  if (field.tagName === 'SELECT') {
    const select = field as HTMLSelectElement;
    const option = select.options[select.selectedIndex];
    if (!option || !option.value.trim()) return null;
    const text = (option.textContent || '').replace(/\s+/g, ' ').trim();
    return text && !PLACEHOLDER_OPTION.test(text) ? text : null;
  }

  const value = (field as HTMLInputElement | HTMLTextAreaElement).value;
  const trimmed = (value || '').replace(/\s+/g, ' ').trim();
  return trimmed || null;
}

/** Build a local Date, returning null when the parts are not a real date. */
function toDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): Date | null {
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function parseDateParts(
  text: string
): { year: number; month: number; day: number } | null {
  const german = text.match(GERMAN_DATE);
  if (german) {
    const year = Number(german[3]);
    return {
      year: year < 100 ? 2000 + year : year,
      month: Number(german[2]),
      day: Number(german[1]),
    };
  }

  const iso = text.match(ISO_DATE);
  if (iso) {
    return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  }

  return null;
}

function parseTimeParts(text: string): { hour: number; minute: number } | null {
  const match = text.match(CLOCK_TIME);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/**
 * Combine the (possibly separate) date and time fields into one instant.
 * Either field may carry both parts — SYBOS shows "02.05.2026 10:15" in some
 * views and splits it across two inputs in others.
 */
function parseStart(
  dateText: string | null,
  timeText: string | null
): { start: Date | null; dateOnly: boolean } {
  const parts =
    (dateText && parseDateParts(dateText)) ||
    (timeText && parseDateParts(timeText)) ||
    null;
  if (!parts) return { start: null, dateOnly: false };

  const time =
    (timeText && parseTimeParts(timeText)) ||
    (dateText && parseTimeParts(dateText)) ||
    null;

  const start = toDate(
    parts.year,
    parts.month,
    parts.day,
    time?.hour ?? 0,
    time?.minute ?? 0
  );
  return { start, dateOnly: !!start && !time };
}

/** Whether the scraped context carries anything worth matching against. */
export function hasUsableContext(ctx: SybosEinsatzContext): boolean {
  return !!(ctx.start || ctx.title || ctx.einsatzart || ctx.ort);
}

/**
 * Scrape the SYBOS Einsatz context from `root` (defaults to the live page).
 * Returns `null` when the page is not a SYBOS Einsatz form, or carries none
 * of the fields we can match on — the panel then behaves as it always did.
 */
export function readSybosEinsatzContext(
  root?: Document
): SybosEinsatzContext | null {
  const doc = root ?? document;

  const values: Partial<Record<ContextKey, string>> = {};

  const fields = doc.querySelectorAll<HTMLElement>(
    'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea'
  );

  for (const field of fields) {
    const value = fieldValue(field);
    if (!value) continue;

    const label = labelTextFor(field, doc);
    const name = field.getAttribute('name') || '';

    for (const key of CONTEXT_KEYS) {
      if (values[key]) continue;
      if (label && LABEL_PATTERNS[key].test(label)) {
        values[key] = value;
        break;
      }
    }

    for (const key of CONTEXT_KEYS) {
      if (values[key]) continue;
      if (name && NAME_PATTERNS[key].test(name)) {
        values[key] = value;
        break;
      }
    }
  }

  const { start, dateOnly } = parseStart(
    values.date ?? null,
    values.time ?? null
  );

  const ctx: SybosEinsatzContext = {
    einsatzId: findEinsatzId(doc),
    start,
    dateOnly,
    title: values.title ?? null,
    einsatzart: values.einsatzart ?? null,
    ort: values.ort ?? null,
  };

  return hasUsableContext(ctx) ? ctx : null;
}
