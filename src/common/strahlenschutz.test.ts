import { describe, expect, it } from 'vitest';
import {
  calculateAbschirmung,
  calculateInverseSquareLaw,
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

describe('calculateAbschirmung', () => {
  // R₀=100, d=10cm, H=10cm (1 half-value layer) → R = 100 * 0.5^1 = 50
  it('calculates R when R₀, d, H are given', () => {
    const result = calculateAbschirmung({ r0: 100, r: null, d: 10, h: 10 });
    expect(result).toEqual({ field: 'r', value: 50 });
  });

  // R=50, d=10, H=10 → R₀ = 50 / 0.5^1 = 100
  it('calculates R₀ when R, d, H are given', () => {
    const result = calculateAbschirmung({ r0: null, r: 50, d: 10, h: 10 });
    expect(result).toEqual({ field: 'r0', value: 100 });
  });

  // R₀=100, R=25, H=10 → d = 10 * log₂(100/25) = 10 * 2 = 20
  it('calculates d when R₀, R, H are given', () => {
    const result = calculateAbschirmung({ r0: 100, r: 25, d: null, h: 10 });
    expect(result).toEqual({ field: 'd', value: 20 });
  });

  // R₀=100, R=25, d=20 → H = 20 / log₂(100/25) = 20 / 2 = 10
  it('calculates H when R₀, R, d are given', () => {
    const result = calculateAbschirmung({ r0: 100, r: 25, d: 20, h: null });
    expect(result).toEqual({ field: 'h', value: 10 });
  });

  // 2 half-value layers: R₀=200, d=14, H=7 → R = 200 * 0.5^2 = 50
  it('handles multiple half-value layers', () => {
    const result = calculateAbschirmung({ r0: 200, r: null, d: 14, h: 7 });
    expect(result).toEqual({ field: 'r', value: 50 });
  });

  it('returns null when more than one field is null', () => {
    const result = calculateAbschirmung({ r0: null, r: null, d: 10, h: 10 });
    expect(result).toBeNull();
  });

  it('returns null when no field is null', () => {
    const result = calculateAbschirmung({ r0: 100, r: 50, d: 10, h: 10 });
    expect(result).toBeNull();
  });

  it('returns null when a filled value is zero', () => {
    const result = calculateAbschirmung({ r0: 100, r: null, d: 0, h: 10 });
    expect(result).toBeNull();
  });

  it('returns null when a filled value is negative', () => {
    const result = calculateAbschirmung({ r0: 100, r: null, d: -5, h: 10 });
    expect(result).toBeNull();
  });
});
