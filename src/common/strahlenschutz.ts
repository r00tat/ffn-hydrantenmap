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

/**
 * Dose and dose rate unit conversion.
 *
 * Supported dose units: Sv, mSv, µSv, R (Röntgen)
 * Supported dose rate units: Sv/h, mSv/h, µSv/h, R/h
 *
 * Conversion: 1 R ≈ 0.01 Sv (for gamma radiation, soft tissue approximation)
 */

export type DoseUnit = 'Sv' | 'mSv' | 'µSv' | 'R';
export type DoseRateUnit = 'Sv/h' | 'mSv/h' | 'µSv/h' | 'R/h';
export type RadiationUnit = DoseUnit | DoseRateUnit;

export const DOSE_UNITS: DoseUnit[] = ['Sv', 'mSv', 'µSv', 'R'];
export const DOSE_RATE_UNITS: DoseRateUnit[] = [
  'Sv/h',
  'mSv/h',
  'µSv/h',
  'R/h',
];
export const ALL_RADIATION_UNITS: RadiationUnit[] = [
  ...DOSE_UNITS,
  ...DOSE_RATE_UNITS,
];

export function isDoseUnit(unit: RadiationUnit): unit is DoseUnit {
  return (DOSE_UNITS as string[]).includes(unit);
}

export function isDoseRateUnit(unit: RadiationUnit): unit is DoseRateUnit {
  return (DOSE_RATE_UNITS as string[]).includes(unit);
}

/** Factor to convert a unit to its base unit (Sv or Sv/h). */
const TO_BASE: Record<RadiationUnit, number> = {
  Sv: 1,
  mSv: 1e-3,
  µSv: 1e-6,
  R: 0.01, // 1 R ≈ 0.01 Sv
  'Sv/h': 1,
  'mSv/h': 1e-3,
  'µSv/h': 1e-6,
  'R/h': 0.01,
};

/**
 * Convert a radiation value between compatible units.
 * Source and target must both be dose or both be dose rate units.
 * Returns null if units are incompatible.
 */
export function convertRadiationUnit(
  value: number,
  from: RadiationUnit,
  to: RadiationUnit
): number | null {
  if (isDoseUnit(from) !== isDoseUnit(to)) return null;
  const baseValue = value * TO_BASE[from];
  return baseValue / TO_BASE[to];
}

/**
 * Get compatible target units for a given source unit.
 */
export function getCompatibleUnits(source: RadiationUnit): RadiationUnit[] {
  if (isDoseUnit(source)) return DOSE_UNITS;
  return DOSE_RATE_UNITS;
}

/**
 * Dosisleistungsberechnung aus Nuklidaktivität.
 *
 * Formula: H = Gamma × A
 *
 * H     = Ortsdosisleistung in 1m Abstand (µSv/h)
 * Gamma = Dosisleistungskonstante (µSv·m²/(h·GBq))
 * A     = Aktivität (GBq)
 */

export interface Nuclide {
  name: string;
  gamma: number; // µSv·m²/(h·GBq)
  peaks?: number[]; // characteristic gamma energies in keV
}

/** Nuclides sorted by name, with gamma dose rate constants. */
export const NUCLIDES: Nuclide[] = [
  { name: 'Am-241', gamma: 3.1, peaks: [59.5] },
  { name: 'Au-198', gamma: 62, peaks: [411.8] },
  { name: 'Ba-133', gamma: 52, peaks: [81, 276.4, 302.9, 356, 383.8] },
  { name: 'Co-57', gamma: 16, peaks: [122.1, 136.5] },
  { name: 'Co-60', gamma: 351, peaks: [1173.2, 1332.5] },
  { name: 'Cr-51', gamma: 5, peaks: [320.1] },
  { name: 'Cs-137', gamma: 92, peaks: [661.7] },
  { name: 'Eu-152', gamma: 168, peaks: [121.8, 244.7, 344.3, 778.9, 964.1, 1112.1, 1408] },
  { name: 'I-125', gamma: 17, peaks: [35.5] },
  { name: 'I-131', gamma: 66, peaks: [364.5] },
  { name: 'Ir-192', gamma: 130, peaks: [295.9, 308.5, 316.5, 468.1] },
  { name: 'Mn-54', gamma: 122, peaks: [834.8] },
  { name: 'Mo-99', gamma: 26, peaks: [140.5, 739.5] },
  { name: 'Na-22', gamma: 327, peaks: [511, 1274.5] },
  { name: 'Ra-226', gamma: 195, peaks: [186.2] },
  { name: 'Se-75', gamma: 56, peaks: [136, 264.7, 279.5, 400.7] },
  { name: 'Sr-90', gamma: 6 }, // pure beta, no gamma peaks
  { name: 'Tc-99m', gamma: 17, peaks: [140.5] },
  { name: 'Zn-65', gamma: 82, peaks: [1115.5] },
];

export type ActivityUnit = 'TBq' | 'GBq' | 'MBq' | 'kBq' | 'Bq' | 'Ci';

export const ACTIVITY_UNITS: ActivityUnit[] = [
  'TBq',
  'GBq',
  'MBq',
  'kBq',
  'Bq',
  'Ci',
];

/** Convert activity value to GBq. */
const ACTIVITY_TO_GBQ: Record<ActivityUnit, number> = {
  TBq: 1000,
  GBq: 1,
  MBq: 0.001,
  kBq: 1e-6,
  Bq: 1e-9,
  Ci: 37,
};

export function convertActivityToGBq(
  value: number,
  unit: ActivityUnit
): number {
  return value * ACTIVITY_TO_GBQ[unit];
}

export interface DosisleistungNuklidValues {
  activity: number | null;
  doseRate: number | null;
}

export interface DosisleistungNuklidResult {
  field: 'activity' | 'doseRate';
  value: number;
}

export interface DosisleistungNuklidHistoryEntry {
  nuclide: string;
  gamma: number;
  activityGBq: number;
  activityUnit: ActivityUnit;
  activityInUnit: number;
  doseRate: number;
  calculatedField: 'activity' | 'doseRate';
  timestamp: Date;
}

/**
 * Calculate dose rate at 1m from nuclide activity, or activity from dose rate.
 * Exactly one of activity/doseRate must be null.
 * gamma must be positive, the filled value must be positive.
 * Activity is in GBq, doseRate in µSv/h.
 */
export function calculateDosisleistungNuklid(
  gamma: number,
  values: DosisleistungNuklidValues
): DosisleistungNuklidResult | null {
  if (gamma <= 0) return null;

  const { activity, doseRate } = values;
  const nullCount = [activity, doseRate].filter((v) => v === null).length;
  if (nullCount !== 1) return null;

  if (activity === null) {
    // A = H / Gamma
    if (doseRate! <= 0) return null;
    return { field: 'activity', value: doseRate! / gamma };
  } else {
    // H = Gamma × A
    if (activity <= 0) return null;
    return { field: 'doseRate', value: gamma * activity };
  }
}
