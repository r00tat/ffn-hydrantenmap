export interface SybosVehicleRow {
  sybosId: string;
  personName: string;
  funktionSelect: HTMLSelectElement;
  fahrzeugSelect: HTMLSelectElement;
}

/**
 * Extract person name from the ADSUBE input value.
 * The value is "Name, DD.MM.YYYY" — strip the birthdate after the first comma.
 * If there is no comma, return the full value trimmed.
 */
function extractPersonName(value: string): string {
  const commaIndex = value.indexOf(',');
  if (commaIndex === -1) {
    return value.trim();
  }
  return value.substring(0, commaIndex).trim();
}

/**
 * Parse the SYBOS vehicle/funktion assignment table from the current page DOM.
 * Finds all WARTIKEL_WAnr selects and extracts row data including
 * person name, funktion select, and fahrzeug select.
 */
export function parseSybosVehicleTable(): SybosVehicleRow[] {
  const fahrzeugSelects = document.querySelectorAll<HTMLSelectElement>(
    'select[name^="WARTIKEL_WAnr_"]'
  );

  const rows: SybosVehicleRow[] = [];

  for (const fahrzeugSelect of fahrzeugSelects) {
    const match = fahrzeugSelect.name.match(/^WARTIKEL_WAnr_(\d+)$/);
    if (!match) continue;

    const sybosId = match[1];
    const tr = fahrzeugSelect.closest('tr');
    if (!tr) continue;

    const adsubeInput = tr.querySelector<HTMLInputElement>(
      'input[name="ADSUBE"]'
    );
    if (!adsubeInput) continue;

    const funktionSelect = tr.querySelector<HTMLSelectElement>(
      'select[name^="ESADgrnr_"]'
    );
    if (!funktionSelect) continue;

    const personName = extractPersonName(adsubeInput.value);
    if (!personName) continue;

    rows.push({ sybosId, personName, funktionSelect, fahrzeugSelect });
  }

  return rows;
}

/**
 * Check if the current page contains a SYBOS vehicle assignment table.
 */
export function hasSybosVehicleTable(): boolean {
  return (
    document.querySelectorAll('select[name^="WARTIKEL_WAnr_"]').length > 0
  );
}
