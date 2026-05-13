import { beforeEach, describe, expect, it, vi } from 'vitest';

// Provide a minimal chrome.storage.local shim before the store imports it.
type StorageData = Record<string, unknown>;
let storage: StorageData = {};
const storageListeners: Array<
  (changes: Record<string, { newValue?: unknown }>, area: string) => void
> = [];

(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: {
    local: {
      get(
        keys: string | string[],
        callback: (result: StorageData) => void,
      ) {
        const arr = Array.isArray(keys) ? keys : [keys];
        const result: StorageData = {};
        for (const key of arr) {
          if (key in storage) result[key] = storage[key];
        }
        callback(result);
      },
      set(items: StorageData, callback?: () => void) {
        const changes: Record<string, { newValue?: unknown }> = {};
        for (const [k, v] of Object.entries(items)) {
          changes[k] = { newValue: v };
          storage[k] = v;
        }
        for (const listener of storageListeners) {
          listener(changes, 'local');
        }
        callback?.();
      },
    },
    onChanged: {
      addListener(
        listener: (
          changes: Record<string, { newValue?: unknown }>,
          area: string,
        ) => void,
      ) {
        storageListeners.push(listener);
      },
    },
  },
  i18n: {
    getUILanguage: () => 'en-US',
  },
};

import { getLocale, initLocale, setLocale, subscribe, _resetForTests } from './store';

describe('locale store', () => {
  beforeEach(() => {
    storage = {};
    _resetForTests();
  });

  it('defaults to de before init', () => {
    expect(getLocale()).toBe('de');
  });

  it('picks the cached value on init', async () => {
    storage.locale = 'en';
    await initLocale();
    expect(getLocale()).toBe('en');
  });

  it('falls back to chrome.i18n.getUILanguage when no cache', async () => {
    await initLocale();
    // mock returns en-US -> resolves to 'en'
    expect(getLocale()).toBe('en');
  });

  it('persists and notifies subscribers on setLocale', async () => {
    await initLocale();
    const seen: string[] = [];
    const unsubscribe = subscribe((next) => seen.push(next));
    await setLocale('de');
    expect(getLocale()).toBe('de');
    expect(storage.locale).toBe('de');
    expect(seen).toContain('de');
    unsubscribe();
  });

  it('ignores subsequent init calls', async () => {
    storage.locale = 'en';
    await initLocale();
    storage.locale = 'de';
    await initLocale();
    expect(getLocale()).toBe('en');
  });
});
