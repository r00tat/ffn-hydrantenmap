// @ts-check

const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {(phase: string, defaultConfig: import("next").NextConfig) => Promise<import("next").NextConfig>} */
module.exports = async () => {
  /** @type {import("next").NextConfig} */
  /** @type {import('next').NextConfig} */
  const nextConfig = {
    /* config options here */
    output: 'standalone',
    // dest: 'public',
    // skipWaiting: true,
    transpilePackages: ['mui-color-input'],
    turbopack: {
      rules: {
        // Macht Markdown importierbar, damit der import.meta.glob in
        // src/components/docs/loadDocsContent.ts den Dateiinhalt als String
        // liefert. Turbopack hat anders als Vite keine eingebaute
        // ?raw-Behandlung.
        //
        // Zwei Sackgassen, die die Next.js-Doku nicht abdeckt: `type: 'text'`
        // laut Doku kennt Turbopack 16.3.0 nicht und bricht den Build mit
        // "Unknown module type" ab (gueltig sind asset, ecmascript, typescript,
        // css, css-module, json, wasm, raw, node, bytes). Und `type: 'raw'`
        // laesst den Build durchlaufen, macht die Dateien aber nicht
        // aufloesbar — zur Laufzeit dann "could not resolve ... into a module".
        // Nur der Loader-Weg funktioniert.
        //
        // Ohne `condition`, damit die Regel unabhaengig von der Query greift.
        '*.md': { loaders: ['raw-loader'], as: '*.js' },
      },
    },
    serverExternalPackages: ['@google-cloud/secret-manager', 'protobufjs'],
    allowedDevOrigins: ['192.168.*.*', '127.0.0*', 'localhost', '*.nip.io'],
    async headers() {
      return [
        {
          source: '/(.*)',
          headers: [
            {
              key: 'X-Frame-Options',
              value: 'DENY',
            },
            {
              key: 'X-Content-Type-Options',
              value: 'nosniff',
            },
            {
              key: 'Strict-Transport-Security',
              value: 'max-age=63072000; includeSubDomains; preload',
            },
            {
              key: 'Referrer-Policy',
              value: 'strict-origin-when-cross-origin',
            },
          ],
        },
      ];
    },
    images: {
      localPatterns: [
        {
          pathname: '/icons/**',
        },
        {
          pathname: '/docs-assets/screenshots/**',
        },
        {
          pathname: '/FFND_logo.png',
        },
      ],
      remotePatterns: [
        {
          protocol: 'https',
          hostname: 'firebasestorage.googleapis.com',
          pathname: '/v0/b/**',
        },
      ],
    },
  };

  // Serwist laeuft seit dem Wechsel auf Turbopack nicht mehr als Webpack-Plugin,
  // sondern ueber den Route Handler in src/app/serwist/[path]/route.ts. Der Service
  // Worker wird dort zur Build-Zeit mit esbuild gebaut und statisch ausgeliefert.
  // withSerwist traegt nur esbuild/esbuild-wasm in serverExternalPackages ein und
  // muss deshalb in jeder Phase greifen, nicht nur im Production-Build.
  const { withSerwist } = await import('@serwist/turbopack');

  return withNextIntl(withSerwist(nextConfig));
};
