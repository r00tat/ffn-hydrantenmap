/**
 * Quadratisches Abstandsgesetz (Inverse Square Law) for radiation protection.
 *
 * Formula: D1² × R1 = D2² × R2
 *
 * D1, D2 = distances (Abstand)
 * R1, R2 = dose rates (Dosisleistung) at the respective distances
 */

export interface StrahlenschutzValues {
  d1: number | null; // Abstand 1
  r1: number | null; // Dosisleistung 1
  d2: number | null; // Abstand 2
  r2: number | null; // Dosisleistung 2
}

export interface StrahlenschutzResult {
  field: keyof StrahlenschutzValues;
  value: number;
}

export interface StrahlenschutzHistoryEntry {
  d1: number;
  r1: number;
  d2: number;
  r2: number;
  calculatedField: keyof StrahlenschutzValues;
  timestamp: Date;
}

/**
 * Calculate the missing value using the inverse square law.
 * Exactly one field must be null; the other three must be positive numbers.
 * Returns null if the input is invalid.
 */
export function calculateInverseSquareLaw(
  values: StrahlenschutzValues
): StrahlenschutzResult | null {
  const entries = Object.entries(values) as [
    keyof StrahlenschutzValues,
    number | null,
  ][];
  const nullFields = entries.filter(([, v]) => v === null);

  if (nullFields.length !== 1) return null;

  const [field] = nullFields[0];
  const filled = Object.fromEntries(
    entries.filter(([, v]) => v !== null)
  ) as Record<string, number>;

  // All filled values must be positive
  if (Object.values(filled).some((v) => v <= 0)) return null;

  let result: number;

  switch (field) {
    case 'r2':
      // R2 = D1² × R1 / D2²
      result = (filled.d1 ** 2 * filled.r1) / filled.d2 ** 2;
      break;
    case 'r1':
      // R1 = D2² × R2 / D1²
      result = (filled.d2 ** 2 * filled.r2) / filled.d1 ** 2;
      break;
    case 'd2':
      // D2 = D1 × √(R1 / R2)
      result = filled.d1 * Math.sqrt(filled.r1 / filled.r2);
      break;
    case 'd1':
      // D1 = D2 × √(R2 / R1)
      result = filled.d2 * Math.sqrt(filled.r2 / filled.r1);
      break;
    default:
      return null;
  }

  return { field, value: result };
}
