import { DEFAULT_LOCALE, Locale, isLocale, resolveInitialLocale } from './config';

const STORAGE_KEY = 'locale';

type Listener = (locale: Locale) => void;
const listeners = new Set<Listener>();

let currentLocale: Locale = DEFAULT_LOCALE;
let initialized = false;
let initPromise: Promise<void> | null = null;

function notify() {
  for (const listener of listeners) {
    listener(currentLocale);
  }
}

function readBrowserLanguage(): string | undefined {
  try {
    return chrome.i18n?.getUILanguage?.();
  } catch {
    return undefined;
  }
}

function readCachedLocale(): Promise<string | undefined> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(STORAGE_KEY, (result) => {
        resolve(result?.[STORAGE_KEY]);
      });
    } catch {
      resolve(undefined);
    }
  });
}

/**
 * Initialize the locale store from chrome.storage. Idempotent — calling
 * multiple times returns the same in-flight promise.
 */
export function initLocale(): Promise<void> {
  if (initialized) return Promise.resolve();
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const cached = await readCachedLocale();
    currentLocale = resolveInitialLocale(cached, readBrowserLanguage());
    initialized = true;
    notify();
  })();

  return initPromise;
}

export function getLocale(): Locale {
  return currentLocale;
}

/**
 * Update the locale and persist it. Notifies all subscribers.
 */
export async function setLocale(locale: Locale): Promise<void> {
  currentLocale = locale;
  try {
    await new Promise<void>((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: locale }, () => resolve());
    });
  } catch {
    // Storage may be unavailable in tests — keep in-memory value either way.
  }
  notify();
}

/**
 * Subscribe to locale changes. Returns an unsubscribe function.
 */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Listen to changes from other contexts (e.g. background script writing
// the locale after a Firestore sync). Only set up in real Chrome — the
// chrome.storage API is unavailable in tests.
try {
  chrome.storage?.onChanged?.addListener?.((changes, area) => {
    if (area !== 'local') return;
    const next = changes[STORAGE_KEY]?.newValue;
    if (isLocale(next) && next !== currentLocale) {
      currentLocale = next;
      notify();
    }
  });
} catch {
  // ignore — no chrome.storage in this environment
}

/**
 * Test-only helper to reset the singleton state between cases.
 */
export function _resetForTests() {
  currentLocale = DEFAULT_LOCALE;
  initialized = false;
  initPromise = null;
  listeners.clear();
}
