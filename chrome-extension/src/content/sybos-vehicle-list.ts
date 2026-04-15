export interface SybosVehicleListRow {
  id: string;
  waname: string;
  warufname: string;
  checkbox: HTMLInputElement;
}

/**
 * Collapse whitespace (including non-breaking space) and trim.
 */
function normalizeCellText(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/\u00a0/g, ' ').trim();
}

/**
 * Parse the SYBOS vehicle-list table (ExtJS x-grid3) from the current DOM.
 * Each row is identified by a `.x-grid3-col-WAname` cell and a sibling
 * checkbox `input[name^="deleted["]`.
 */
export function parseSybosVehicleList(): SybosVehicleListRow[] {
  const wanameCells = document.querySelectorAll<HTMLElement>(
    '.x-grid3-col-WAname'
  );

  const rows: SybosVehicleListRow[] = [];

  for (const wanameCell of wanameCells) {
    const tr = wanameCell.closest('tr');
    if (!tr) continue;

    const checkbox = tr.querySelector<HTMLInputElement>(
      'input[type="checkbox"][name^="deleted["]'
    );
    if (!checkbox) continue;

    const match = checkbox.name.match(/^deleted\[(\d+)\]$/);
    if (!match) continue;

    const id = match[1];
    const waname = normalizeCellText(wanameCell.textContent);
    if (!waname) continue;

    const warufnameCell = tr.querySelector<HTMLElement>(
      '.x-grid3-col-WArufname'
    );
    const warufname = normalizeCellText(warufnameCell?.textContent);

    rows.push({ id, waname, warufname, checkbox });
  }

  return rows;
}

/**
 * Check whether the current page contains a SYBOS vehicle-list table.
 */
export function hasSybosVehicleList(): boolean {
  return document.querySelector('.x-grid3-col-WAname') !== null;
}
