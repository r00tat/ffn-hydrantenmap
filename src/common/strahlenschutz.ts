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

/**
 * Schutzwert-Berechnung (Shielding / Protection Factor).
 * Used in Strahlenschutz Leistungsbewerb Bronze, Station 1.
 *
 * Formula: R = R₀ / S^n
 *
 * R₀ = Dosisleistung ohne Abschirmung (dose rate without shielding)
 * R  = Dosisleistung mit Abschirmung (dose rate with shielding)
 * S  = Schutzwert des Materials (protection factor of the material)
 * n  = Anzahl der Schichten (number of shielding layers)
 */

export interface SchutzwertValues {
  r0: number | null; // Dosisleistung ohne Abschirmung
  r: number | null; // Dosisleistung mit Abschirmung
  s: number | null; // Schutzwert
  n: number | null; // Anzahl der Schichten
}

export interface SchutzwertResult {
  field: keyof SchutzwertValues;
  value: number;
}

export interface SchutzwertHistoryEntry {
  r0: number;
  r: number;
  s: number;
  n: number;
  calculatedField: keyof SchutzwertValues;
  timestamp: Date;
}

/**
 * Calculate the missing shielding value using R = R₀ / S^n.
 * Exactly one field must be null; the other three must be positive numbers.
 * Additionally, S must be >= 1 (a shielding factor < 1 makes no physical sense).
 * Returns null if the input is invalid.
 */
export function calculateSchutzwert(
  values: SchutzwertValues
): SchutzwertResult | null {
  const entries = Object.entries(values) as [
    keyof SchutzwertValues,
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

  // S must be >= 1 when provided
  if (field !== 's' && filled.s < 1) return null;

  // R must be <= R₀ when both are provided
  if (field !== 'r' && field !== 'r0' && filled.r > filled.r0) return null;

  let result: number;

  switch (field) {
    case 'r':
      // R = R₀ / S^n
      result = filled.r0 / Math.pow(filled.s, filled.n);
      break;
    case 'r0':
      // R₀ = R × S^n
      result = filled.r * Math.pow(filled.s, filled.n);
      break;
    case 's':
      // S = (R₀ / R)^(1/n)
      result = Math.pow(filled.r0 / filled.r, 1 / filled.n);
      break;
    case 'n':
      // n = log(R₀ / R) / log(S)
      if (filled.s === 1) return null; // log(1) = 0, division by zero
      result = Math.log(filled.r0 / filled.r) / Math.log(filled.s);
      break;
    default:
      return null;
  }

  return { field, value: result };
}

/**
 * Aufenthaltszeit-Berechnung (Permissible Exposure Time).
 * Used in Strahlenschutz Leistungsbewerb Bronze.
 *
 * Formula: t = D / R
 *
 * t = zulässige Aufenthaltszeit (h)
 * D = zulässige Dosis (mSv)
 * R = Dosisleistung (mSv/h)
 */

export interface AufenthaltszeitValues {
  t: number | null; // Aufenthaltszeit (h)
  d: number | null; // Dosis (mSv)
  r: number | null; // Dosisleistung (mSv/h)
}

export interface AufenthaltszeitResult {
  field: keyof AufenthaltszeitValues;
  value: number;
}

export interface AufenthaltszeitHistoryEntry {
  t: number;
  d: number;
  r: number;
  calculatedField: keyof AufenthaltszeitValues;
  timestamp: Date;
}

/**
 * Calculate the missing exposure time value using t = D / R.
 * Exactly one field must be null; the other two must be positive numbers.
 * Returns null if the input is invalid.
 */
export function calculateAufenthaltszeit(
  values: AufenthaltszeitValues
): AufenthaltszeitResult | null {
  const entries = Object.entries(values) as [
    keyof AufenthaltszeitValues,
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
    case 't':
      // t = D / R
      result = filled.d / filled.r;
      break;
    case 'd':
      // D = t × R
      result = filled.t * filled.r;
      break;
    case 'r':
      // R = D / t
      result = filled.d / filled.t;
      break;
    default:
      return null;
  }

  return { field, value: result };
}
