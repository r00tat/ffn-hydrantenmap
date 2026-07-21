/**
 * Shared, pure utilities for re-posting SYBOS forms via fetch.
 *
 * SYBOS (https://sybos.lfv-bgld.at) has no JSON API — every mutation is a
 * classic HTML form POST that re-renders the whole page (or an ExtJS
 * fragment) as the response. To automate submissions we have to faithfully
 * reproduce what a real browser submit would send (including SYBOS's
 * ExtJS-style array/bracket field names such as `BListMulti[]` or
 * `name_tbl[deleted[96431]]`), post it with the session cookie attached, and
 * parse the HTML that comes back to look for the operation id or an error.
 *
 * This module is intentionally free of `chrome.*` calls and imports from
 * other feature files — it only touches the DOM/fetch APIs so it can be
 * unit tested in jsdom and reused by the orchestration code that will call
 * into it.
 */

/**
 * Serialize a SYBOS `<form>` the same way a normal (unclicked) browser
 * submit would, then apply `overrides` on top.
 *
 * `FormData(form)` already implements the "successful control" rules we
 * need: it includes the selected `<option>` of a `<select>`, includes a
 * checkbox/radio only when `checked` (using its `value` attribute, which in
 * SYBOS forms is the entity id, e.g. `selected[96431]` -> `"96431"`), skips
 * `disabled` fields, and — because no submit button was "clicked" — omits
 * `<button>` and `type="submit"` controls entirely. It also preserves
 * duplicate keys and document order, which matters for SYBOS's array-style
 * names like `BListMulti[]`.
 *
 * `overrides` lets the caller inject the submit-button marker SYBOS expects
 * (a `string` value) or strip an existing field entirely (a `null` value):
 * - `{ key: 'value' }` replaces ALL existing entries for `key` with a
 *   single entry (`params.set`).
 * - `{ key: null }` removes ALL existing entries for `key`
 *   (`params.delete`).
 * Keys not mentioned in `overrides` are left untouched.
 */
export function serializeForm(
  form: HTMLFormElement,
  overrides?: Record<string, string | null>
): URLSearchParams {
  const formData = new FormData(form);
  const params = new URLSearchParams();

  for (const [key, value] of formData.entries()) {
    // SYBOS forms never submit <input type="file">, but guard defensively
    // rather than throwing if one ever appears.
    params.append(key, typeof value === 'string' ? value : value.name);
  }

  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === null) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
  }

  return params;
}

/** Parse an HTML string (a SYBOS response body) into a `Document`. */
export function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

/**
 * POST urlencoded `params` to a SYBOS `url` and parse the HTML response.
 *
 * `credentials: 'include'` makes the browser attach the SYBOS session
 * cookie automatically, same as a same-origin form submit would. Throws if
 * the response status is not ok so callers can distinguish a network/HTTP
 * failure from a SYBOS-level validation error (see `detectError`).
 */
export async function postForm(
  url: string,
  params: URLSearchParams
): Promise<Document> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    throw new Error(`SYBOS request to ${url} failed with status ${res.status}`);
  }

  const text = await res.text();
  return parseHtml(text);
}

/**
 * GET a SYBOS `url` and parse the HTML response — the read-only counterpart
 * of {@link postForm}.
 *
 * Used to fetch the step-1 selection popups (which SYBOS serves as HTML
 * fragments) before re-posting them. `credentials: 'include'` attaches the
 * session cookie, same as `postForm`. Throws on a non-ok status so callers
 * can distinguish a network/HTTP failure from a SYBOS-level error.
 */
export async function getDocument(url: string): Promise<Document> {
  const res = await fetch(url, { credentials: 'include' });

  if (!res.ok) {
    throw new Error(`SYBOS request to ${url} failed with status ${res.status}`);
  }

  const text = await res.text();
  return parseHtml(text);
}

/**
 * Extract a SYBOS Einsatz id from the `idParent=<id>` query string that the
 * detail page bakes into every link/onclick that opens a sub-form popup
 * (Personal, Material, …). This is the only place the id is exposed on the
 * `frmEinsatzAdd` detail page — its own URL carries `id=0` and it has no
 * `EINSATZ_ESnr` hidden field. `idParent=0` (a "new"/empty reference) is
 * ignored.
 */
function findIdParentInLinks(root: ParentNode): string | null {
  const els = root.querySelectorAll<HTMLElement>(
    'a[href*="idParent="], [onclick*="idParent="]'
  );
  for (const el of els) {
    const source = el.getAttribute('href') || el.getAttribute('onclick') || '';
    const match = source.match(/idParent=(\d+)/);
    if (match && match[1] !== '0') {
      return match[1];
    }
  }
  return null;
}

/**
 * Find the SYBOS "Einsatz" (operation) id.
 *
 * SYBOS surfaces it in three places, checked in order of reliability:
 * 1. a hidden `EINSATZ_ESnr` input (present on the selection/edit forms and
 *    in fetched response fragments);
 * 2. the `idParent=<id>` embedded in the detail page's popup links/onclicks
 *    (the `frmEinsatzAdd` detail page has no `EINSATZ_ESnr` and `id=0` in its
 *    own URL, so this is the only source there);
 * 3. the `idParent` query parameter of the current page URL.
 *
 * The URL fallback is only consulted when no explicit `root` was passed in,
 * since a fetched `Document` has no relationship to `window.location`.
 */
export function findEinsatzId(
  root?: Document | Document['documentElement'] | ParentNode
): string | null {
  const searchRoot: ParentNode = root ?? document;

  const input = searchRoot.querySelector<HTMLInputElement>(
    'input[name="EINSATZ_ESnr"]'
  );
  if (input?.value) {
    return input.value;
  }

  const linkId = findIdParentInLinks(searchRoot);
  if (linkId) {
    return linkId;
  }

  if (root === undefined) {
    const idParent = new URLSearchParams(window.location.search).get(
      'idParent'
    );
    if (idParent) {
      return idParent;
    }
  }

  return null;
}

/** Class-name fragments SYBOS/PAT (the underlying ExtJS/PatVeraSoft stack) */
/** uses to mark validation/error output. Matched case-insensitively. */
const ERROR_CLASS_PATTERN = /error|fehler|paterror/i;

/** Cap on how much error text we surface, in case SYBOS returns a huge blob. */
const MAX_ERROR_MESSAGE_LENGTH = 300;

/**
 * Best-effort detection of a SYBOS validation/error response.
 *
 * SYBOS has no JSON error contract — a failed submit just re-renders HTML,
 * so we look for the convention its markup tends to use: an element whose
 * class name contains "error"/"fehler"/"patError" (case-insensitive).
 *
 * This is deliberately conservative. In particular we do NOT scan the body
 * for words like "Pflichtfeld" (required field): the successful response is
 * the re-rendered edit form, which commonly carries a static required-field
 * legend, and a body-wide keyword scan would flag every successful transfer
 * as an error. Detection keys off explicit error-styled elements only, and
 * will be refined once we've seen real SYBOS failure responses.
 *
 * Returns the trimmed text of the first matching element (capped to
 * `MAX_ERROR_MESSAGE_LENGTH` characters), or `null` if nothing matched.
 */
export function detectError(doc: Document): string | null {
  const candidates = doc.querySelectorAll<HTMLElement>('[class]');
  for (const el of candidates) {
    if (!ERROR_CLASS_PATTERN.test(el.className)) continue;

    const text = el.textContent?.trim();
    if (text) {
      return text.slice(0, MAX_ERROR_MESSAGE_LENGTH);
    }
  }

  return null;
}
