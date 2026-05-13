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

export interface NuclidePeak {
  energy: number; // keV
  intensity: number; // 0..1 (photons per decay)
}

export interface Nuclide {
  name: string;
  gamma: number; // µSv·m²/(h·GBq)
  peaks?: NuclidePeak[]; // characteristic gamma peaks
  url?: string; // link to nuclide data sheet
}

/** Base URL for RadiaCode isotope library. */
const RC = 'https://www.radiacode.com/isotope';

/** Nuclides sorted by name, with gamma dose rate constants.
 *  Peak intensities (branching ratios) are from NNDC NuDat 3. */
export const NUCLIDES: Nuclide[] = [
  {
    name: 'Am-241',
    gamma: 3.1,
    peaks: [{ energy: 59.5, intensity: 0.359 }],
    url: `${RC}/am-241`,
  },
  {
    name: 'Au-198',
    gamma: 62,
    peaks: [{ energy: 411.8, intensity: 0.956 }],
    url: `${RC}/au-198`,
  },
  {
    name: 'Ba-133',
    gamma: 52,
    peaks: [
      { energy: 81, intensity: 0.329 },
      { energy: 276.4, intensity: 0.072 },
      { energy: 302.9, intensity: 0.183 },
      { energy: 356, intensity: 0.621 },
      { energy: 383.8, intensity: 0.089 },
    ],
    url: `${RC}/ba-133`,
  },
  {
    name: 'Co-57',
    gamma: 16,
    peaks: [
      { energy: 122.1, intensity: 0.856 },
      { energy: 136.5, intensity: 0.107 },
    ],
    url: `${RC}/co-57`,
  },
  {
    name: 'Co-60',
    gamma: 351,
    peaks: [
      { energy: 1173.2, intensity: 0.999 },
      { energy: 1332.5, intensity: 1.0 },
    ],
    url: `${RC}/co-60`,
  },
  {
    name: 'Cr-51',
    gamma: 5,
    peaks: [{ energy: 320.1, intensity: 0.099 }],
    url: `${RC}/cr-51`,
  },
  {
    name: 'Cs-137',
    gamma: 92,
    peaks: [{ energy: 661.7, intensity: 0.851 }],
    url: `${RC}/cs-137`,
  },
  {
    name: 'Eu-152',
    gamma: 168,
    peaks: [
      { energy: 121.8, intensity: 0.285 },
      { energy: 244.7, intensity: 0.075 },
      { energy: 344.3, intensity: 0.265 },
      { energy: 778.9, intensity: 0.129 },
      { energy: 964.1, intensity: 0.146 },
      { energy: 1112.1, intensity: 0.136 },
      { energy: 1408, intensity: 0.21 },
    ],
    url: `${RC}/eu-152`,
  },
  {
    name: 'I-125',
    gamma: 17,
    peaks: [{ energy: 35.5, intensity: 0.067 }],
    url: `${RC}/i-125`,
  },
  {
    name: 'I-131',
    gamma: 66,
    peaks: [{ energy: 364.5, intensity: 0.815 }],
    url: `${RC}/i-131`,
  },
  {
    name: 'Ir-192',
    gamma: 130,
    peaks: [
      { energy: 295.9, intensity: 0.287 },
      { energy: 308.5, intensity: 0.297 },
      { energy: 316.5, intensity: 0.828 },
      { energy: 468.1, intensity: 0.478 },
    ],
    url: `${RC}/ir-192`,
  },
  {
    name: 'Mn-54',
    gamma: 122,
    peaks: [{ energy: 834.8, intensity: 1.0 }],
    url: `${RC}/mn-54`,
  },
  {
    name: 'Mo-99',
    gamma: 26,
    peaks: [
      { energy: 140.5, intensity: 0.894 },
      { energy: 739.5, intensity: 0.121 },
    ],
    url: `${RC}/mo-99`,
  },
  {
    name: 'Na-22',
    gamma: 327,
    peaks: [
      { energy: 511, intensity: 1.807 },
      { energy: 1274.5, intensity: 0.999 },
    ],
    url: `${RC}/na-22`,
  },
  {
    name: 'Ra-226',
    gamma: 195,
    peaks: [{ energy: 186.2, intensity: 0.036 }],
    url: `${RC}/ra-226`,
  },
  {
    name: 'Se-75',
    gamma: 56,
    peaks: [
      { energy: 136, intensity: 0.585 },
      { energy: 264.7, intensity: 0.589 },
      { energy: 279.5, intensity: 0.25 },
      { energy: 400.7, intensity: 0.114 },
    ],
    url: `${RC}/se-75`,
  },
  { name: 'Sr-90', gamma: 6, url: `${RC}/sr-90` }, // pure beta emitter, no gamma peaks (Bremsstrahlung only)
  {
    name: 'Tc-99m',
    gamma: 17,
    peaks: [{ energy: 140.5, intensity: 0.89 }],
    url: `${RC}/tc-99m`,
  },
  {
    name: 'Zn-65',
    gamma: 82,
    peaks: [{ energy: 1115.5, intensity: 0.506 }],
    url: `${RC}/zn-65`,
  },
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

/**
 * Radioaktiver Fallout nach Kernwaffeneinsatz (Way-Wigner Zerfallsgesetz).
 * Grundlage: FM 3-3-1 "Nuclear Contamination Avoidance", STS Silber.
 *
 * Dosisleistung zur Zeit t (h nach Detonation):
 *   R(t) = R₁ · t^(-1.2)
 *
 *   R₁ = Bezugsdosisleistung bei H+1 Stunde (mSv/h)
 *
 * Akkumulierte Dosis bei Aufenthalt von Eintrittszeit Te für die Dauer Ts:
 *   D = ∫[Te → Te+Ts] R₁ · t^(-1.2) dt
 *     = 5 · R₁ · ( Te^(-0.2) − (Te + Ts)^(-0.2) )   [mSv]
 */

export const FALLOUT_DECAY_EXPONENT = 1.2;

/** Dosisleistung R(t) = R₁ · t^(-1.2). t in Stunden nach Detonation. */
export function falloutDoseRate(r1: number, t: number): number {
  return r1 * Math.pow(t, -FALLOUT_DECAY_EXPONENT);
}

/** Gesamtdosis D = 5·R₁·(Te^(-0.2) - (Te+Ts)^(-0.2)). */
export function falloutDose(r1: number, te: number, ts: number): number {
  return 5 * r1 * (Math.pow(te, -0.2) - Math.pow(te + ts, -0.2));
}

export interface FalloutValues {
  r1: number | null; // Bezugsdosisleistung bei H+1 (mSv/h)
  te: number | null; // Eintrittszeit (h nach Detonation)
  ts: number | null; // Aufenthaltsdauer (h)
  d: number | null; // Gesamtdosis (mSv)
}

export interface FalloutResult {
  field: keyof FalloutValues;
  value: number;
}

export interface FalloutHistoryEntry {
  r1: number;
  te: number;
  ts: number;
  d: number;
  calculatedField: keyof FalloutValues;
  timestamp: Date;
}

/**
 * Calculate the missing fallout value using D = 5·R₁·(Te^(-0.2) - (Te+Ts)^(-0.2)).
 * Exactly one field must be null; the other three must be positive numbers.
 * Te uses numerical bisection (log-space) since it appears in both terms.
 */
export function calculateFallout(
  values: FalloutValues
): FalloutResult | null {
  const entries = Object.entries(values) as [
    keyof FalloutValues,
    number | null,
  ][];
  const nullFields = entries.filter(([, v]) => v === null);
  if (nullFields.length !== 1) return null;

  const [field] = nullFields[0];
  const filled = Object.fromEntries(
    entries.filter(([, v]) => v !== null)
  ) as Record<string, number>;

  if (Object.values(filled).some((v) => v <= 0)) return null;

  let result: number;

  switch (field) {
    case 'd': {
      result =
        5 *
        filled.r1 *
        (Math.pow(filled.te, -0.2) -
          Math.pow(filled.te + filled.ts, -0.2));
      break;
    }
    case 'r1': {
      const factor =
        Math.pow(filled.te, -0.2) - Math.pow(filled.te + filled.ts, -0.2);
      if (factor <= 0) return null;
      result = filled.d / (5 * factor);
      break;
    }
    case 'ts': {
      // (Te+Ts)^(-0.2) = Te^(-0.2) - D/(5·R₁)
      const tePow = Math.pow(filled.te, -0.2);
      const taPow = tePow - filled.d / (5 * filled.r1);
      if (taPow <= 0) return null; // Dosis übersteigt maximal erreichbaren Wert
      const ta = Math.pow(taPow, -5);
      result = ta - filled.te;
      if (result <= 0) return null;
      break;
    }
    case 'te': {
      // f(Te) = 5·R₁·(Te^(-0.2) − (Te+Ts)^(-0.2)) − D = 0
      // monoton fallend in Te → log-space Bisektion
      const r1 = filled.r1;
      const ts = filled.ts;
      const target = filled.d;
      const f = (te: number) =>
        5 * r1 * (Math.pow(te, -0.2) - Math.pow(te + ts, -0.2)) - target;

      let loL = Math.log(1e-6);
      let hiL = Math.log(1e10);
      if (f(Math.exp(hiL)) > 0) return null;
      if (f(Math.exp(loL)) < 0) return null;
      let mid = Math.exp((loL + hiL) / 2);
      for (let i = 0; i < 100; i++) {
        const midL = (loL + hiL) / 2;
        mid = Math.exp(midL);
        const fm = f(mid);
        if (Math.abs(fm) < 1e-9 * Math.max(1, target)) break;
        if (fm > 0) loL = midL;
        else hiL = midL;
        if (hiL - loL < 1e-12) break;
      }
      result = mid;
      break;
    }
    default:
      return null;
  }

  if (!isFinite(result) || result <= 0) return null;
  return { field, value: result };
}

/**
 * Bezugsdosisleistung R₁ aus Messung zur Zeit t nach Detonation.
 *
 *   R₁ = R(t) · t^1.2
 *
 * t in Stunden nach Detonation; R(t) und R₁ in mSv/h.
 */

export interface FalloutR1Values {
  r1: number | null; // Bezugsdosisleistung bei H+1 (mSv/h)
  rt: number | null; // gemessene Dosisleistung zur Zeit t (mSv/h)
  t: number | null; // Zeit nach Detonation (h)
}

export interface FalloutR1Result {
  field: keyof FalloutR1Values;
  value: number;
}

export interface FalloutR1HistoryEntry {
  r1: number;
  rt: number;
  t: number;
  calculatedField: keyof FalloutR1Values;
  timestamp: Date;
}

export function calculateFalloutR1(
  values: FalloutR1Values
): FalloutR1Result | null {
  const entries = Object.entries(values) as [
    keyof FalloutR1Values,
    number | null,
  ][];
  const nullFields = entries.filter(([, v]) => v === null);
  if (nullFields.length !== 1) return null;

  const [field] = nullFields[0];
  const filled = Object.fromEntries(
    entries.filter(([, v]) => v !== null)
  ) as Record<string, number>;

  if (Object.values(filled).some((v) => v <= 0)) return null;

  let result: number;
  switch (field) {
    case 'r1':
      result = filled.rt * Math.pow(filled.t, FALLOUT_DECAY_EXPONENT);
      break;
    case 'rt':
      result = filled.r1 * Math.pow(filled.t, -FALLOUT_DECAY_EXPONENT);
      break;
    case 't':
      // R₁ = Rt · t^1.2 → t = (R₁/Rt)^(1/1.2)
      result = Math.pow(filled.r1 / filled.rt, 1 / FALLOUT_DECAY_EXPONENT);
      break;
    default:
      return null;
  }

  if (!isFinite(result) || result <= 0) return null;
  return { field, value: result };
}
