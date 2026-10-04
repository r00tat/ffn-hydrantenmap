'use client';

import type { AbstractIntlMessages } from 'next-intl';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import deMessages from '../../../messages/de.json';
import enMessages from '../../../messages/en.json';
import { APP_TIME_ZONE, DEFAULT_LOCALE, isLocale, type Locale } from '../../i18n/config';

const CATALOGS: Record<Locale, AbstractIntlMessages> = {
  de: deMessages,
  en: enMessages,
};

/**
 * Message-Kataloge aus dem JS-Bundle statt aus der Seite.
 *
 * Reicht das Root-Layout die Kataloge als Prop an `NextIntlClientProvider`,
 * landen sie serialisiert in den RSC-Daten jeder Seite — rund 180 KiB je
 * Seite, für jede vorgewärmte Seite der App-Shell aufs Neue. Hier stecken
 * sie in einem Chunk, den der Precache des Service Workers einmal je Build
 * lädt. Der Server übersetzt weiter über `src/i18n/request.ts`.
 */
export default function IntlClientProvider({
  locale,
  children,
}: {
  locale: string;
  children: ReactNode;
}) {
  const active = isLocale(locale) ? locale : DEFAULT_LOCALE;
  return (
    <NextIntlClientProvider
      locale={active}
      messages={CATALOGS[active]}
      timeZone={APP_TIME_ZONE}
    >
      {children}
    </NextIntlClientProvider>
  );
}
