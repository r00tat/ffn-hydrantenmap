import type { SybosVehicleListRow } from './sybos-vehicle-list';

/**
 * Find a SYBOS vehicle-list row matching `ekName`. Matching rules:
 *   1. WAname exact (case-insensitive, trimmed) — first hit wins.
 *   2. Else WArufname exact (case-insensitive, trimmed).
 *   3. Else null.
 * Empty input always returns null; rows with empty WArufname never
 * match an empty-string candidate.
 */
export function findMatchingVehicleListRow(
  ekName: string,
  rows: SybosVehicleListRow[]
): SybosVehicleListRow | null {
  const normalized = ekName.trim().toLowerCase();
  if (!normalized) return null;

  for (const row of rows) {
    if (row.waname.trim().toLowerCase() === normalized) {
      return row;
    }
  }

  for (const row of rows) {
    const ruf = row.warufname.trim().toLowerCase();
    if (ruf && ruf === normalized) {
      return row;
    }
  }

  return null;
}
