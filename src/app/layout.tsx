import { SerwistProvider } from '@serwist/turbopack/react';
// Roboto aus dem eigenen Build statt von fonts.googleapis.com: sonst ging
// bei jedem Seitenaufruf die IP-Adresse an Google. Nur latin und latin-ext,
// die anderen Subsets blaehten den Precache auf. MUIs Standardtheme erwartet
// die Familie "Roboto", die @fontsource unveraendert so nennt.
import '@fontsource/roboto/latin-300.css';
import '@fontsource/roboto/latin-400.css';
import '@fontsource/roboto/latin-500.css';
import '@fontsource/roboto/latin-700.css';
import '@fontsource/roboto/latin-ext-300.css';
import '@fontsource/roboto/latin-ext-400.css';
import '@fontsource/roboto/latin-ext-500.css';
import '@fontsource/roboto/latin-ext-700.css';
import 'leaflet/dist/leaflet.css';
import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import React from 'react';
import { appIconPath, withEnvironmentPrefix } from '../common/appEnvironment';
import { SERWIST_SW_URL } from '../common/serviceWorker';
import AppProviders from '../components/providers/AppProviders';
import '../styles/globals.css';

// In der Dev-Umgebung vorangestellt gekennzeichnet, damit Tab und installierte
// PWA von der Produktion unterscheidbar sind — s. common/appEnvironment.ts.
const APP_NAME = withEnvironmentPrefix('Einsatzkarte FFN');
const APP_DEFAULT_TITLE = withEnvironmentPrefix('Einsatzkarte FFN');
const APP_TITLE_TEMPLATE = withEnvironmentPrefix('%s - PWA App');
const APP_DESCRIPTION = 'Hydranten und Einsatzkarte der FF Neusiedl am See';

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: {
    default: APP_DEFAULT_TITLE,
    template: APP_TITLE_TEMPLATE,
  },
  description: APP_DESCRIPTION,
  // In dev mit DEV-Band, s. appIconPath().
  icons: {
    icon: [
      { url: appIconPath('favicon.ico'), sizes: '16x16 32x32 48x48' },
      { url: appIconPath('icon-192.png'), sizes: '192x192', type: 'image/png' },
    ],
    apple: { url: appIconPath('apple-touch-icon.png'), sizes: '180x180' },
  },
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
        {/* Titel und Beschreibung kommen aus `metadata` oben. Ein hart
            kodiertes <title> hier verdoppelte sie nicht nur, es unterdrückte
            auch die Titel der Unterseiten aus APP_TITLE_TEMPLATE. Den
            <link rel="manifest"> setzt Next selbst, seit das Manifest aus
            app/manifest.ts kommt, die Icons aus `metadata.icons`. */}
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#1976d2" />
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
