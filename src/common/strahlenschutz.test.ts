import { describe, expect, it } from 'vitest';
import {
  calculateInverseSquareLaw,
  calculateSchutzwert,
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
