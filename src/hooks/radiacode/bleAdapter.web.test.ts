import { afterEach, describe, expect, it } from 'vitest';
import { webAdapter } from './bleAdapter.web';

describe('webAdapter.isSupported', () => {
  const originalNav = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNav,
      configurable: true,
    });
  });

  it('returns true when navigator.bluetooth exists', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { bluetooth: {} },
      configurable: true,
    });
    expect(webAdapter.isSupported()).toBe(true);
  });

  it('returns false when navigator.bluetooth missing', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
    });
    expect(webAdapter.isSupported()).toBe(false);
  });
});
