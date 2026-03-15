import { describe, it, expect } from 'vitest';
import { isTruthy } from './boolish';

describe('isTruthy', () => {
  it.each(['on', 'yes', 'true', 't'])('returns true for string "%s"', (v) => {
    expect(isTruthy(v)).toBe(true);
  });

  it('returns true for boolean true', () => {
    expect(isTruthy(true)).toBe(true);
  });

  it.each(['false', 'no', 'off', '1', 'True', 'YES', ''])(
    'returns false for string "%s"',
    (v) => {
      expect(isTruthy(v)).toBe(false);
    }
  );

  it('returns false for boolean false', () => {
    expect(isTruthy(false)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isTruthy(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isTruthy(undefined)).toBe(false);
  });
});
