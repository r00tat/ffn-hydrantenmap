/**
 * i18n configuration constants used by both client and server.
 */

export const LOCALES = ['de', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'de';

export const LOCALE_COOKIE_NAME = 'NEXT_LOCALE';

export const LOCALE_LABELS: Record<Locale, string> = {
  de: 'Deutsch',
  en: 'English',
};

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

/**
 * Pick the best matching locale from a comma-separated Accept-Language header.
 * Falls back to DEFAULT_LOCALE when no entry matches.
 */
export function pickLocaleFromAcceptLanguage(
  acceptLanguage: string | null | undefined,
): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  const entries = acceptLanguage
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const qParam = params.find((p) => p.trim().startsWith('q='));
      const q = qParam ? parseFloat(qParam.split('=')[1]) : 1;
      return { tag: tag.trim().toLowerCase(), q: Number.isNaN(q) ? 1 : q };
    })
    .sort((a, b) => b.q - a.q);

  for (const entry of entries) {
    const primary = entry.tag.split('-')[0];
    if (isLocale(primary)) {
      return primary;
    }
  }
  return DEFAULT_LOCALE;
}
