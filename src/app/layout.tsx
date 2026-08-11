import { SerwistProvider } from '@serwist/turbopack/react';
import 'leaflet/dist/leaflet.css';
import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import React from 'react';
import { SERWIST_SW_URL } from '../common/serviceWorker';
import AppProviders from '../components/providers/AppProviders';
import '../styles/globals.css';

const APP_NAME = 'Einsatzkarte FFN';
const APP_DEFAULT_TITLE = 'Einsatzkarte FFN';
const APP_TITLE_TEMPLATE = '%s - PWA App';
const APP_DESCRIPTION = 'Hydranten und Einsatzkarte der FF Neusiedl am See';

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: {
    default: APP_DEFAULT_TITLE,
    template: APP_TITLE_TEMPLATE,
  },
  description: APP_DESCRIPTION,
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: APP_DEFAULT_TITLE,
    // startUpImage: [],
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: 'website',
    siteName: APP_NAME,
    title: {
      default: APP_DEFAULT_TITLE,
      template: APP_TITLE_TEMPLATE,
    },
    description: APP_DESCRIPTION,
  },
  twitter: {
    card: 'summary',
    title: {
      default: APP_DEFAULT_TITLE,
      template: APP_TITLE_TEMPLATE,
    },
    description: APP_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: '#1976d2',
};

export default async function RootLayout({
  // Layouts must accept a children prop.
  // This will be populated with nested layouts or pages
  children,
}: {
  children: React.ReactNode;
}) {
  /* eslint-disable @next/next/no-page-custom-font */

  const locale = await getLocale();
  const messages = await getMessages();

  return (
    // suppressHydrationWarning: In der Capacitor-App injiziert Capacitors
    // SystemBars-Plugin die Insets als Inline-Style (--safe-area-inset-top usw.)
    // auf <html>, weil env(safe-area-inset-*) in Android-WebViews < 140 wegen
    // eines Chromium-Bugs falsche Werte liefert (insetsHandling: 'css', Default).
    // Das passiert vor der Hydration und ausserhalb von React, also kann der
    // Server das Attribut nicht mitrendern — die Werte sind geraetespezifisch.
    // React meldet das als Mismatch ("This won't be patched up"), laesst den
    // Style aber stehen, was genau richtig ist. Das Flag wirkt nur fuer die
    // Attribute dieses einen Elements, nicht fuer den Teilbaum darunter.
    <html lang={locale} suppressHydrationWarning>
      <head>
        <title>Einsatzkarte</title>
        <meta
          name="description"
          content="Einsatzkarte der Freiwilligen Feuerwehr Neusiedl am See"
        />
        <link rel="icon" href="/favicon.ico" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1976d2" />

        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css?family=Roboto:300,400,500,700&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/icon?family=Material+Icons"
        />
      </head>
      <body>
        {/* Registriert den von src/app/serwist/[path]/route.ts ausgelieferten
            Service Worker im Root-Scope. In der Entwicklung bleibt er aus, damit
            kein Precache-Layer zwischen Dev-Server und Browser haengt — das war
            vorher implizit so, weil das Serwist-Webpack-Plugin nur im
            Production-Build lief. */}
        <SerwistProvider
          swUrl={SERWIST_SW_URL}
          disable={process.env.NODE_ENV !== 'production'}
          options={{ scope: '/' }}
        >
          <NextIntlClientProvider locale={locale} messages={messages}>
            <AppProviders>{children}</AppProviders>
          </NextIntlClientProvider>
        </SerwistProvider>
      </body>
    </html>
  );
}
