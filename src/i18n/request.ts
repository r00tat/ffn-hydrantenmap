import { getRequestConfig } from 'next-intl/server';
import { auth } from '../app/auth';
import { resolveLocale } from './getLocale';

/**
 * next-intl request config. Loads the active locale (session → cookie →
 * Accept-Language → default) and the matching message catalog.
 */
export default getRequestConfig(async () => {
  let sessionLocale: string | null = null;
  try {
    const session = await auth();
    sessionLocale = session?.user?.language ?? null;
  } catch {
    // auth() can throw during build / static analysis — fall through to
    // cookie/header detection in that case.
    sessionLocale = null;
  }

  const locale = await resolveLocale(sessionLocale);
  const messages = (await import(`../../messages/${locale}.json`)).default;

  return {
    locale,
    messages,
    timeZone: 'Europe/Vienna',
  };
});
