import 'server-only';

import { cookies, headers } from 'next/headers';
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  Locale,
  isLocale,
  pickLocaleFromAcceptLanguage,
} from './config';

/**
 * Resolve the active locale on the server, with this precedence:
 *   1. Locale persisted on the NextAuth session (`session.user.language`)
 *   2. Cookie `NEXT_LOCALE`
 *   3. Browser `Accept-Language` header
 *   4. DEFAULT_LOCALE
 *
 * The session lookup is performed by the caller and passed in as
 * `sessionLocale` to avoid a circular import with `src/app/auth.ts`.
 */
export async function resolveLocale(
  sessionLocale?: string | null,
): Promise<Locale> {
  if (isLocale(sessionLocale)) {
    return sessionLocale;
  }

  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  if (isLocale(cookieLocale)) {
    return cookieLocale;
  }

  const headerList = await headers();
  return pickLocaleFromAcceptLanguage(headerList.get('accept-language'));
}

export { DEFAULT_LOCALE };
