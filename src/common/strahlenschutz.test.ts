import { describe, expect, it } from 'vitest';
import {
  calculateAufenthaltszeit,
  calculateDosisleistungNuklid,
  calculateInverseSquareLaw,
  calculateSchutzwert,
  convertActivityToGBq,
  convertRadiationUnit,
  getCompatibleUnits,
  isDoseUnit,
  isDoseRateUnit,
  NUCLIDES,
  StrahlenschutzValues,
} from './strahlenschutz';

describe('calculateInverseSquareLaw', () => {
  it('calculates R2 when D1, R1, D2 are given', () => {
    const result = calculateInverseSquareLaw({
      d1: 2,
      r1: 100,
      d2: 4,
      r2: null,
    });
    expect(result).toEqual({ field: 'r2', value: 25 });
  });

  it('calculates R1 when D1, D2, R2 are given', () => {
    const result = calculateInverseSquareLaw({
      d1: 2,
      r1: null,
      d2: 4,
      r2: 25,
    });
    expect(result).toEqual({ field: 'r1', value: 100 });
  });

  it('calculates D2 when D1, R1, R2 are given', () => {
    const result = calculateInverseSquareLaw({
      d1: 2,
      r1: 100,
      d2: null,
      r2: 25,
    });
    expect(result).toEqual({ field: 'd2', value: 4 });
  });

  it('calculates D1 when D2, R1, R2 are given', () => {
    const result = calculateInverseSquareLaw({
      d1: null,
      r1: 100,
      d2: 4,
      r2: 25,
    });
    expect(result).toEqual({ field: 'd1', value: 2 });
  });

  it('returns null when more than one field is null', () => {
    const result = calculateInverseSquareLaw({
      d1: null,
      r1: null,
      d2: 4,
      r2: 25,
    });
    expect(result).toBeNull();
  });

  it('returns null when no field is null', () => {
    const result = calculateInverseSquareLaw({
      d1: 2,
      r1: 100,
      d2: 4,
      r2: 25,
    });
    expect(result).toBeNull();
  });

  it('returns null when a filled value is zero', () => {
    const result = calculateInverseSquareLaw({
      d1: 0,
      r1: 100,
      d2: 4,
      r2: null,
    });
    expect(result).toBeNull();
  });

  it('returns null when a filled value is negative', () => {
    const result = calculateInverseSquareLaw({
      d1: -2,
      r1: 100,
      d2: 4,
      r2: null,
    });
    expect(result).toBeNull();
  });

  it('handles non-integer results', () => {
    const result = calculateInverseSquareLaw({
      d1: 3,
      r1: 50,
      d2: 5,
      r2: null,
    });
    expect(result).not.toBeNull();
    expect(result!.field).toBe('r2');
    expect(result!.value).toBeCloseTo(18, 0);
  });
});

describe('calculateSchutzwert', () => {
  // R₀=100, S=2, n=1 → R = 100 / 2^1 = 50
  it('calculates R when R₀, S, n are given', () => {
    const result = calculateSchutzwert({ r0: 100, r: null, s: 2, n: 1 });
    expect(result).toEqual({ field: 'r', value: 50 });
  });

  // R=50, S=2, n=1 → R₀ = 50 × 2^1 = 100
  it('calculates R₀ when R, S, n are given', () => {
    const result = calculateSchutzwert({ r0: null, r: 50, s: 2, n: 1 });
    expect(result).toEqual({ field: 'r0', value: 100 });
  });

  // R₀=100, R=25, n=2 → S = (100/25)^(1/2) = 4^0.5 = 2
  it('calculates S when R₀, R, n are given', () => {
    const result = calculateSchutzwert({ r0: 100, r: 25, s: null, n: 2 });
    expect(result).toEqual({ field: 's', value: 2 });
  });

  // R₀=100, R=25, S=2 → n = log(100/25) / log(2) = log(4)/log(2) = 2
  it('calculates n when R₀, R, S are given', () => {
    const result = calculateSchutzwert({ r0: 100, r: 25, s: 2, n: null });
    expect(result).toEqual({ field: 'n', value: 2 });
  });

  // Multiple layers: R₀=200, S=4, n=2 → R = 200 / 4^2 = 200/16 = 12.5
  it('handles multiple layers with higher S', () => {
    const result = calculateSchutzwert({ r0: 200, r: null, s: 4, n: 2 });
    expect(result).toEqual({ field: 'r', value: 12.5 });
  });

  // Fractional n: R₀=100, R=50, S=4 → n = log(2)/log(4) = 0.5
  it('handles fractional number of layers', () => {
    const result = calculateSchutzwert({ r0: 100, r: 50, s: 4, n: null });
    expect(result!.field).toBe('n');
    expect(result!.value).toBeCloseTo(0.5);
  });

  it('returns null when S is 1 and calculating n (division by zero)', () => {
    const result = calculateSchutzwert({ r0: 100, r: 100, s: 1, n: null });
    expect(result).toBeNull();
  });

  it('returns null when more than one field is null', () => {
    const result = calculateSchutzwert({ r0: null, r: null, s: 2, n: 1 });
    expect(result).toBeNull();
  });

  it('returns null when no field is null', () => {
    const result = calculateSchutzwert({ r0: 100, r: 50, s: 2, n: 1 });
    expect(result).toBeNull();
  });

  it('returns null when a filled value is zero', () => {
    const result = calculateSchutzwert({ r0: 100, r: null, s: 0, n: 1 });
    expect(result).toBeNull();
  });

  it('returns null when a filled value is negative', () => {
    const result = calculateSchutzwert({ r0: 100, r: null, s: -2, n: 1 });
    expect(result).toBeNull();
  });
});

describe('calculateAufenthaltszeit', () => {
  // D=100mSv, R=50mSv/h → t = 100/50 = 2h
  it('calculates t when D and R are given', () => {
    const result = calculateAufenthaltszeit({ t: null, d: 100, r: 50 });
    expect(result).toEqual({ field: 't', value: 2 });
  });

  // t=2h, R=50mSv/h → D = 2 × 50 = 100mSv
  it('calculates D when t and R are given', () => {
    const result = calculateAufenthaltszeit({ t: 2, d: null, r: 50 });
    expect(result).toEqual({ field: 'd', value: 100 });
  });

  // t=2h, D=100mSv → R = 100/2 = 50mSv/h
  it('calculates R when t and D are given', () => {
    const result = calculateAufenthaltszeit({ t: 2, d: 100, r: null });
    expect(result).toEqual({ field: 'r', value: 50 });
  });

  // Einsatzrichtwert: D=15mSv, R=0.5mSv/h → t = 30h
  it('handles realistic scenario with low dose rate', () => {
    const result = calculateAufenthaltszeit({ t: null, d: 15, r: 0.5 });
    expect(result).toEqual({ field: 't', value: 30 });
  });

  it('returns null when more than one field is null', () => {
    const result = calculateAufenthaltszeit({ t: null, d: null, r: 50 });
    expect(result).toBeNull();
  });

  it('returns null when no field is null', () => {
    const result = calculateAufenthaltszeit({ t: 2, d: 100, r: 50 });
    expect(result).toBeNull();
  });

  it('returns null when a filled value is zero', () => {
    const result = calculateAufenthaltszeit({ t: null, d: 0, r: 50 });
    expect(result).toBeNull();
  });

  it('returns null when a filled value is negative', () => {
    const result = calculateAufenthaltszeit({ t: null, d: -10, r: 50 });
    expect(result).toBeNull();
  });
});

describe('convertRadiationUnit', () => {
  // Dose conversions
  it('converts Sv to mSv', () => {
    expect(convertRadiationUnit(1, 'Sv', 'mSv')).toBe(1000);
  });

  it('converts mSv to µSv', () => {
    expect(convertRadiationUnit(1, 'mSv', 'µSv')).toBeCloseTo(1000);
  });

  it('converts µSv to Sv', () => {
    expect(convertRadiationUnit(1000000, 'µSv', 'Sv')).toBeCloseTo(1);
  });

  it('converts R to mSv (1 R ≈ 10 mSv)', () => {
    expect(convertRadiationUnit(1, 'R', 'mSv')).toBeCloseTo(10);
  });

  it('converts mSv to R', () => {
    expect(convertRadiationUnit(10, 'mSv', 'R')).toBeCloseTo(1);
  });

  it('converts R to µSv', () => {
    expect(convertRadiationUnit(1, 'R', 'µSv')).toBeCloseTo(10000);
  });

  // Dose rate conversions
  it('converts Sv/h to mSv/h', () => {
    expect(convertRadiationUnit(1, 'Sv/h', 'mSv/h')).toBe(1000);
  });

  it('converts mSv/h to µSv/h', () => {
    expect(convertRadiationUnit(1, 'mSv/h', 'µSv/h')).toBeCloseTo(1000);
  });

  it('converts R/h to mSv/h', () => {
    expect(convertRadiationUnit(1, 'R/h', 'mSv/h')).toBeCloseTo(10);
  });

  // Identity conversion
  it('converts same unit to itself', () => {
    expect(convertRadiationUnit(42, 'mSv', 'mSv')).toBe(42);
  });

  // Incompatible units
  it('returns null when converting dose to dose rate', () => {
    expect(convertRadiationUnit(1, 'mSv', 'mSv/h')).toBeNull();
  });

  it('returns null when converting dose rate to dose', () => {
    expect(convertRadiationUnit(1, 'mSv/h', 'mSv')).toBeNull();
  });
});

describe('getCompatibleUnits', () => {
  it('returns dose units for a dose source', () => {
    expect(getCompatibleUnits('mSv')).toEqual(['Sv', 'mSv', 'µSv', 'R']);
  });

  it('returns dose rate units for a dose rate source', () => {
    expect(getCompatibleUnits('mSv/h')).toEqual([
      'Sv/h',
      'mSv/h',
      'µSv/h',
      'R/h',
    ]);
  });
});

describe('isDoseUnit / isDoseRateUnit', () => {
  it('identifies dose units', () => {
    expect(isDoseUnit('Sv')).toBe(true);
    expect(isDoseUnit('R')).toBe(true);
    expect(isDoseUnit('mSv/h')).toBe(false);
  });

  it('identifies dose rate units', () => {
    expect(isDoseRateUnit('Sv/h')).toBe(true);
    expect(isDoseRateUnit('R/h')).toBe(true);
    expect(isDoseRateUnit('mSv')).toBe(false);
  });
});

describe('convertActivityToGBq', () => {
  it('converts GBq to GBq (identity)', () => {
    expect(convertActivityToGBq(5, 'GBq')).toBe(5);
  });

  it('converts MBq to GBq', () => {
    expect(convertActivityToGBq(1000, 'MBq')).toBe(1);
  });

  it('converts TBq to GBq', () => {
    expect(convertActivityToGBq(1, 'TBq')).toBe(1000);
  });

  it('converts kBq to GBq', () => {
    expect(convertActivityToGBq(1000000, 'kBq')).toBe(1);
  });

  it('converts Bq to GBq', () => {
    expect(convertActivityToGBq(1e9, 'Bq')).toBe(1);
  });

  it('converts Ci to GBq', () => {
    expect(convertActivityToGBq(1, 'Ci')).toBe(37);
  });
});

describe('NUCLIDES', () => {
  it('contains expected nuclides', () => {
    const names = NUCLIDES.map((n) => n.name);
    expect(names).toContain('Co-60');
    expect(names).toContain('Cs-137');
    expect(names).toContain('Ir-192');
    expect(names).toContain('Am-241');
    expect(names).toContain('Sr-90');
  });

  it('is sorted alphabetically by name', () => {
    const names = NUCLIDES.map((n) => n.name);
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });

  it('all gamma values are positive', () => {
    NUCLIDES.forEach((n) => {
      expect(n.gamma).toBeGreaterThan(0);
    });
  });
});

describe('NUCLIDES peak data', () => {
  it('Cs-137 has a single peak at 661.7 keV with intensity 0.851', () => {
    const cs137 = NUCLIDES.find((n) => n.name === 'Cs-137')!;
    expect(cs137.peaks).toEqual([{ energy: 661.7, intensity: 0.851 }]);
  });

  it('Co-60 has two peaks near 100% intensity', () => {
    const co60 = NUCLIDES.find((n) => n.name === 'Co-60')!;
    expect(co60.peaks).toHaveLength(2);
    expect(co60.peaks![0].intensity).toBeGreaterThan(0.99);
    expect(co60.peaks![1].intensity).toBeGreaterThan(0.99);
  });

  it('Ba-133 has 356 keV as dominant peak', () => {
    const ba133 = NUCLIDES.find((n) => n.name === 'Ba-133')!;
    const dominant = ba133.peaks!.reduce((a, b) =>
      a.intensity > b.intensity ? a : b,
    );
    expect(dominant.energy).toBe(356);
    expect(dominant.intensity).toBeCloseTo(0.621, 2);
  });
});

describe('calculateDosisleistungNuklid', () => {
  it('calculates dose rate from activity', () => {
    const result = calculateDosisleistungNuklid(351, {
      activity: 1,
      doseRate: null,
    });
    expect(result).toEqual({ field: 'doseRate', value: 351 });
  });

  it('calculates activity from dose rate', () => {
    const result = calculateDosisleistungNuklid(351, {
      activity: null,
      doseRate: 351,
    });
    expect(result).toEqual({ field: 'activity', value: 1 });
  });

  it('handles fractional activity', () => {
    const result = calculateDosisleistungNuklid(92, {
      activity: 0.5,
      doseRate: null,
    });
    expect(result).toEqual({ field: 'doseRate', value: 46 });
  });

  it('returns null when both fields are null', () => {
    const result = calculateDosisleistungNuklid(351, {
      activity: null,
      doseRate: null,
    });
    expect(result).toBeNull();
  });

  it('returns null when no field is null', () => {
    const result = calculateDosisleistungNuklid(351, {
      activity: 1,
      doseRate: 351,
    });
    expect(result).toBeNull();
  });

  it('returns null when gamma is zero', () => {
    const result = calculateDosisleistungNuklid(0, {
      activity: 1,
      doseRate: null,
    });
    expect(result).toBeNull();
  });

  it('returns null when gamma is negative', () => {
    const result = calculateDosisleistungNuklid(-10, {
      activity: 1,
      doseRate: null,
    });
    expect(result).toBeNull();
  });

  it('returns null when filled activity is zero', () => {
    const result = calculateDosisleistungNuklid(351, {
      activity: 0,
      doseRate: null,
    });
    expect(result).toBeNull();
  });

  it('returns null when filled activity is negative', () => {
    const result = calculateDosisleistungNuklid(351, {
      activity: -1,
      doseRate: null,
    });
    expect(result).toBeNull();
  });

  it('returns null when filled doseRate is zero', () => {
    const result = calculateDosisleistungNuklid(351, {
      activity: null,
      doseRate: 0,
    });
    expect(result).toBeNull();
  });
});
