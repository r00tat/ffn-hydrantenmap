import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerAlgorithm,
  getAlgorithm,
  getAlgorithmList,
  resetRegistry,
} from './registry';
import type { InterpolationAlgorithm, DataPoint } from './types';

const mockAlgo: InterpolationAlgorithm<null> = {
  id: 'mock',
  label: 'Mock',
  params: [],
  prepare: () => null,
  evaluate: () => 42,
};

describe('interpolation registry', () => {
  beforeEach(() => {
    resetRegistry();
  });

  it('registers and retrieves an algorithm', () => {
    registerAlgorithm(mockAlgo);
    expect(getAlgorithm('mock')).toBe(mockAlgo);
  });

  it('returns undefined for unknown algorithm', () => {
    expect(getAlgorithm('nonexistent')).toBeUndefined();
  });

  it('lists all registered algorithms', () => {
    const algo2: InterpolationAlgorithm<null> = { ...mockAlgo, id: 'mock2', label: 'Mock 2' };
    registerAlgorithm(mockAlgo);
    registerAlgorithm(algo2);
    const list = getAlgorithmList();
    expect(list).toHaveLength(2);
    expect(list.map((a) => a.id)).toEqual(['mock', 'mock2']);
  });

  it('throws on duplicate registration', () => {
    registerAlgorithm(mockAlgo);
    expect(() => registerAlgorithm(mockAlgo)).toThrow();
  });
});
