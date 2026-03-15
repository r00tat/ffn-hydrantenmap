import { describe, it, expect } from 'vitest';
import { uniqueArray } from './arrayUtils';

describe('uniqueArray', () => {
  it('removes duplicate numbers', () => {
    expect(uniqueArray([1, 2, 2, 3, 1])).toEqual([1, 2, 3]);
  });

  it('removes duplicate strings', () => {
    expect(uniqueArray(['a', 'b', 'a'])).toEqual(['a', 'b']);
  });

  it('returns empty array unchanged', () => {
    expect(uniqueArray([])).toEqual([]);
  });

  it('returns single-element array unchanged', () => {
    expect(uniqueArray([42])).toEqual([42]);
  });

  it('preserves order of first occurrence', () => {
    expect(uniqueArray([3, 1, 2, 1, 3])).toEqual([3, 1, 2]);
  });

  it('does not deduplicate objects (reference equality)', () => {
    const obj = { id: 1 };
    expect(uniqueArray([obj, obj])).toEqual([obj]);
    // Two separate objects with same shape are NOT deduplicated
    expect(uniqueArray([{ id: 1 }, { id: 1 }])).toHaveLength(2);
  });
});
