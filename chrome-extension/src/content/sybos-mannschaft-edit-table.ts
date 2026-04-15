export interface SybosMannschaftEditRow {
  adrId: string;
  rowKey: string;
  personName: string;
  statusSelect: HTMLSelectElement | null;
  funktionSelect: HTMLSelectElement;
  fahrzeugSelect: HTMLSelectElement;
}

const DATE_PATTERN = /^\d{1,2}\.\d{1,2}\.\d{2,4}$/;

/**
 * Extract the clean person name from an ADR_ input value. Values look like:
 *   "Bencic Florian, MSc, 26.01.1995"
 *   "Ing. Preis Thomas, 06.02.1988"
 *   "Meyer Denise, BSc, MBA, 29.07.1995"
 *   "Köstner Günther, 09.01.1970"
 * The last comma-separated part is always a birthdate. Intermediate parts are
 * academic/professional titles — we drop them because Einsatzkarte stores just
 * the bare name. The first part (e.g. "Bencic Florian") is returned.
 */
function extractPersonName(value: string): string {
  const parts = value
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (parts.length === 0) return value.trim();
  // Drop trailing date part if present
  if (parts.length > 1 && DATE_PATTERN.test(parts[parts.length - 1])) {
    parts.pop();
  }
  // First part is the name; titles live in remaining parts and are discarded.
  return parts[0];
}

/**
 * Parse the SYBOS "Mannschaft editieren" table rows.
 * Each row is anchored by an `ESADFahrzeugListe_<key>` select where
 * `<key>` encodes `<adrId>_<einsatzId>_<YYYY>_<MM>_<DD>_<HH>_<MM>_<SS>`.
 * The person name lives in a sibling `input[id^="ADR_"]` element.
 */
export function parseSybosMannschaftEditTable(): SybosMannschaftEditRow[] {
  const fahrzeugSelects = document.querySelectorAll<HTMLSelectElement>(
    'select[name^="ESADFahrzeugListe_"]'
  );

  const rows: SybosMannschaftEditRow[] = [];

  for (const fahrzeugSelect of fahrzeugSelects) {
    const match = fahrzeugSelect.name.match(/^ESADFahrzeugListe_(.+)$/);
    if (!match) continue;
    const rowKey = match[1];

    const tr = fahrzeugSelect.closest('tr');
    if (!tr) continue;

    const adrInput = tr.querySelector<HTMLInputElement>(
      'input[id^="ADR_"][name^="ADR_"]'
    );
    if (!adrInput) continue;

    const adrMatch = adrInput.id.match(/^ADR_(\d+)$/);
    if (!adrMatch) continue;
    const adrId = adrMatch[1];

    const funktionSelect = tr.querySelector<HTMLSelectElement>(
      `select[name="ESADFunktionListe_${rowKey}"]`
    );
    if (!funktionSelect) continue;

    const statusSelect = tr.querySelector<HTMLSelectElement>(
      `select[name="ESADStatusListe_${rowKey}"]`
    );

    const personName = extractPersonName(adrInput.value);
    if (!personName) continue;

    rows.push({
      adrId,
      rowKey,
      personName,
      statusSelect,
      funktionSelect,
      fahrzeugSelect,
    });
  }

  return rows;
}

/**
 * Check whether the current page is the SYBOS "Mannschaft editieren" view.
 * Detection requires at least one per-row `ESADFahrzeugListe_<key>` select
 * (the top-of-page "apply" select has no suffix and is ignored).
 */
export function hasSybosMannschaftEditTable(): boolean {
  return (
    document.querySelector('select[name^="ESADFahrzeugListe_"]') !== null
  );
}
