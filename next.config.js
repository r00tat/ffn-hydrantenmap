// @ts-check

const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/**
 * Die Firebase-Hosting-Domain, die den Auth-Handler ausliefert.
 *
 * Der Rewrite darunter spiegelt `/__/auth/*` unter die eigene Domain, damit
 * der Google-Login same-origin ablaufen kann (Begruendung ausfuehrlich in
 * src/components/firebase/authDomain.ts). Der Proxy ist **immer** aktiv, auch
 * wenn die App ihn per Voreinstellung noch nicht benutzt — nur so laesst er
 * sich mit `?authProxy=1` auf einem einzelnen Geraet ausprobieren.
 *
 * Steht in der Konfiguration bereits eine eigene Domain, gibt es hier nichts
 * zu spiegeln: Der Rewrite zeigte sonst auf sich selbst.
 *
 * Die Antwort kommt unveraendert vom Upstream — `headers()` unten greift auf
 * einem Rewrite zu einer fremden URL nicht mit. Das ist hier erwuenscht: Das
 * Firebase-SDK haengt `/__/auth/iframe` als verstecktes iframe in die Seite,
 * unser `X-Frame-Options: DENY` wuerde das Laden verhindern und den Login
 * stehenlassen. Firebase Hosting setzt fuer diesen Pfad selbst keins.
 */
function firebaseAuthUpstream() {
  try {
    const config = JSON.parse(process.env.NEXT_PUBLIC_FIREBASE_APIKEY || '{}');
    const domain =
      config.authDomain ||
      (config.projectId ? `${config.projectId}.firebaseapp.com` : '');
    return /\.(firebaseapp\.com|web\.app)$/.test(domain) ? domain : undefined;
  } catch {
    // Eine kaputte Konfiguration meldet der Browser deutlich genug; der Build
    // soll daran nicht scheitern.
    return undefined;
  }
}

/** Sicherheitskopfzeilen, die fuer jeden Pfad gelten. */
const commonSecurityHeaders = [
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
];

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
    experimental: {
      // Turbopacks Build-Cache liegt in .next/cache/turbopack und beschleunigt
      // wiederholte Builds erheblich — aber nur, wenn das Verzeichnis zwischen
      // den Builds erhalten bleibt. Der Docker-Build startet aus einer frischen
      // Layer und kopiert am Ende nur .next/standalone und .next/static, der
      // Cache waere also reine Schreiblast (~430 MB) in der Builder-Stage.
      //
      // Der Cache wird ausserdem nie kompaktiert: gemessen wachsen pro Build
      // ~3,7 MB und 5 .sst-Dateien dazu, und das Verzeichnis ist an die
      // Next-Version gebunden — ein Update laesst das alte liegen. Lokal daher
      // gelegentlich `npm run clean:cache`.
      turbopackFileSystemCacheForBuild:
        process.env.DISABLE_TURBOPACK_BUILD_CACHE !== '1',
    },
    serverExternalPackages: ['@google-cloud/secret-manager', 'protobufjs'],
    allowedDevOrigins: ['192.168.*.*', '127.0.0*', 'localhost', '*.nip.io'],
    async rewrites() {
      const upstream = firebaseAuthUpstream();
      if (!upstream) return [];
      return [
        {
          source: '/__/auth/:path*',
          destination: `https://${upstream}/__/auth/:path*`,
        },
      ];
    },
    async headers() {
      return [
        {
          source: '/(.*)',
          headers: [
            ...commonSecurityHeaders,
            {
              key: 'X-Frame-Options',
              value: 'DENY',
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
