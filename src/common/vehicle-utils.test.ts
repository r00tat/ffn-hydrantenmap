import { describe, expect, it } from 'vitest';
import { getEffectiveBesatzung } from './vehicle-utils';

describe('getEffectiveBesatzung', () => {
  it('returns manual besatzung when set', () => {
    expect(getEffectiveBesatzung('5', 0)).toBe(5);
    expect(getEffectiveBesatzung('3', 8)).toBe(3);
  });

  it('returns crewCount - 1 when besatzung is empty and crew assigned', () => {
    expect(getEffectiveBesatzung(undefined, 6)).toBe(5);
    expect(getEffectiveBesatzung('', 6)).toBe(5);
    expect(getEffectiveBesatzung('0', 6)).toBe(5);
  });

  it('returns 0 when only 1 crew member assigned', () => {
    expect(getEffectiveBesatzung(undefined, 1)).toBe(0);
  });

  it('returns 0 when no besatzung and no crew', () => {
    expect(getEffectiveBesatzung(undefined, 0)).toBe(0);
    expect(getEffectiveBesatzung('', 0)).toBe(0);
  });
});
