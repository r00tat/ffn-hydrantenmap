import { describe, expect, it } from 'vitest';
import { LatLngPosition } from '../../../../common/geo';
import { calculateArea, formatArea } from './area';

describe('calculateArea', () => {
  it('returns 0 for fewer than 3 positions', () => {
    expect(calculateArea([])).toBe(0);
    expect(calculateArea([[47, 16]])).toBe(0);
    expect(
      calculateArea([
        [47, 16],
        [47.001, 16],
      ])
    ).toBe(0);
  });

  it('computes the area of a small rectangle near Neusiedl (~8450 m²)', () => {
    // ~0.001° latitude  ≈ 111.32 m
    // ~0.001° longitude ≈ 75.9 m at 47° N
    // → expected area ≈ 8450 m²
    const rectangle: LatLngPosition[] = [
      [47.0, 16.0],
      [47.001, 16.0],
      [47.001, 16.001],
      [47.0, 16.001],
    ];
    const area = calculateArea(rectangle);
    expect(area).toBeGreaterThan(8200);
    expect(area).toBeLessThan(8700);
  });

  it('is independent of winding order (returns absolute area)', () => {
    const clockwise: LatLngPosition[] = [
      [47.0, 16.0],
      [47.001, 16.0],
      [47.001, 16.001],
      [47.0, 16.001],
    ];
    const counterClockwise: LatLngPosition[] = [...clockwise].reverse();
    expect(calculateArea(counterClockwise)).toBeCloseTo(
      calculateArea(clockwise),
      5
    );
  });

  it('ignores an explicitly closed ring (first === last point)', () => {
    const open: LatLngPosition[] = [
      [47.0, 16.0],
      [47.001, 16.0],
      [47.001, 16.001],
      [47.0, 16.001],
    ];
    const closed: LatLngPosition[] = [...open, [47.0, 16.0]];
    expect(calculateArea(closed)).toBeCloseTo(calculateArea(open), 3);
  });
});

describe('formatArea', () => {
  it('shows small areas in square meters (rounded, no decimals)', () => {
    expect(formatArea(0)).toBe('0 m²');
    expect(formatArea(8450.3)).toBe('8450 m²');
    expect(formatArea(9999)).toBe('9999 m²');
  });

  it('shows areas of 1 hectare or more in hectares', () => {
    expect(formatArea(10000)).toBe('1 ha');
    expect(formatArea(12345)).toBe('1.23 ha');
    expect(formatArea(255000)).toBe('25.5 ha');
  });

  it('shows areas of 1 km² or more in square kilometers', () => {
    expect(formatArea(1_000_000)).toBe('1 km²');
    expect(formatArea(1_500_000)).toBe('1.5 km²');
  });
});
