export const LOCALES = ['de', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'de';

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
  );
}

/**
 * Resolve the initial UI locale for the popup.
 * Priority:
 *   1. Explicit value cached in `chrome.storage.local.locale`
 *   2. Browser UI language via `chrome.i18n.getUILanguage()`
 *   3. DEFAULT_LOCALE
 */
export function resolveInitialLocale(
  cached: string | undefined,
  browserUiLanguage: string | undefined,
): Locale {
  if (isLocale(cached)) return cached;
  if (browserUiLanguage) {
    const primary = browserUiLanguage.toLowerCase().split('-')[0];
    if (isLocale(primary)) return primary;
  }
  return DEFAULT_LOCALE;
}
