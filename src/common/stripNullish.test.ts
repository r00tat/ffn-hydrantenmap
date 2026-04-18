import { describe, it, expect } from 'vitest';
import { stripNullish } from './stripNullish';

describe('stripNullish', () => {
  it('removes undefined and null values', () => {
    const input = {
      a: 'hello',
      b: undefined,
      c: null,
      d: 0,
      e: '',
      f: false,
    };

    const result = stripNullish(input);

    expect(result).toEqual({ a: 'hello', d: 0, e: '', f: false });
    expect('b' in result).toBe(false);
    expect('c' in result).toBe(false);
  });

  it('preserves nested objects as-is', () => {
    const nested = { foo: 'bar' };
    const result = stripNullish({ nested, skip: undefined });

    expect(result.nested).toBe(nested);
    expect('skip' in result).toBe(false);
  });
});
