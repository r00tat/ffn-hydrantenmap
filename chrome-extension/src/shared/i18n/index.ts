import { useEffect, useSyncExternalStore } from 'react';
import { Locale } from './config';
import { getMessage, interpolate } from './messages';
import { getLocale, initLocale, subscribe } from './store';

export type { Locale } from './config';
export { LOCALES, DEFAULT_LOCALE, isLocale } from './config';
export { setLocale } from './store';

/**
 * React hook that returns the current locale and re-renders when it
 * changes. Triggers a one-time async initialization from chrome.storage
 * on first use.
 */
export function useLocale(): Locale {
  // Kick off the async init once. The store handles idempotency.
  useEffect(() => {
    void initLocale();
  }, []);

  return useSyncExternalStore(subscribe, getLocale, getLocale);
}

/**
 * Translator function returned by `useTranslations`. Looks up
 * `namespace.key` (when namespace is set) or `key` (when not) and
 * interpolates `{placeholder}` tokens from `params`.
 */
export type Translator = (
  key: string,
  params?: Record<string, string | number>,
) => string;

/**
 * Hook that returns a translation function bound to an optional
 * namespace prefix.
 */
export function useTranslations(namespace?: string): Translator {
  const locale = useLocale();
  return (key, params) => {
    const fullKey = namespace ? `${namespace}.${key}` : key;
    return interpolate(getMessage(locale, fullKey), params);
  };
}
