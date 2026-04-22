import { RadiacodeDeviceRef } from './types';

const STORAGE_KEY = 'radiacode.defaultDevice';

interface KVStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

let cachedStore: KVStore | null = null;

async function getStore(): Promise<KVStore> {
  if (cachedStore) return cachedStore;
  try {
    const modName = '@capacitor/preferences';
    const mod = await import(/* @vite-ignore */ /* webpackIgnore: true */ modName);
    const prefs = mod.Preferences;
    cachedStore = {
      async get(key) {
        const { value } = await prefs.get({ key });
        return value ?? null;
      },
      async set(key, value) {
        await prefs.set({ key, value });
      },
      async remove(key) {
        await prefs.remove({ key });
      },
    };
    return cachedStore;
  } catch {
    cachedStore = {
      async get(key) {
        if (typeof localStorage === 'undefined') return null;
        return localStorage.getItem(key);
      },
      async set(key, value) {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(key, value);
      },
      async remove(key) {
        if (typeof localStorage === 'undefined') return;
        localStorage.removeItem(key);
      },
    };
    return cachedStore;
  }
}

export async function loadDefaultDevice(): Promise<RadiacodeDeviceRef | null> {
  const store = await getStore();
  const raw = await store.get(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RadiacodeDeviceRef;
  } catch {
    return null;
  }
}

export async function saveDefaultDevice(device: RadiacodeDeviceRef): Promise<void> {
  const store = await getStore();
  await store.set(STORAGE_KEY, JSON.stringify(device));
}

export async function clearDefaultDevice(): Promise<void> {
  const store = await getStore();
  await store.remove(STORAGE_KEY);
}
