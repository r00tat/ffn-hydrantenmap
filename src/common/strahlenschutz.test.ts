import { describe, expect, it } from 'vitest';
import {
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
