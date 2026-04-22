// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadDefaultDevice, saveDefaultDevice, clearDefaultDevice } from './devicePreference';

describe('devicePreference', () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { store = {}; },
    });
  });

  it('returns null when no device saved', async () => {
    expect(await loadDefaultDevice()).toBeNull();
  });

  it('persists and loads device', async () => {
    await saveDefaultDevice({ id: 'abc', name: 'RC-102', serial: 'SN1' });
    expect(await loadDefaultDevice()).toMatchObject({ id: 'abc', serial: 'SN1' });
  });

  it('overwrites existing device on save', async () => {
    await saveDefaultDevice({ id: 'abc', name: 'A', serial: 'SN1' });
    await saveDefaultDevice({ id: 'xyz', name: 'B', serial: 'SN2' });
    expect((await loadDefaultDevice())?.id).toBe('xyz');
  });

  it('clearDefaultDevice removes stored device', async () => {
    await saveDefaultDevice({ id: 'abc', name: 'A', serial: 'SN1' });
    await clearDefaultDevice();
    expect(await loadDefaultDevice()).toBeNull();
  });
});
