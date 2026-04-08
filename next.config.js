// @ts-check

const {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
} = require('next/constants');

/** @type {(phase: string, defaultConfig: import("next").NextConfig) => Promise<import("next").NextConfig>} */
module.exports = async (phase) => {
  /** @type {import("next").NextConfig} */
  /** @type {import('next').NextConfig} */
  const nextConfig = {
    /* config options here */
    // dest: 'public',
    // skipWaiting: true,
    transpilePackages: ['mui-color-input'],
    async headers() {
      // Content-Security-Policy directives
      const cspDirectives = [
        // Default: only same origin
        "default-src 'self'",
        // Scripts: self + inline for Next.js hydration (nonce would be better but requires custom server)
        "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
        // Styles: self + unsafe-inline required by MUI (emotion/styled-components)
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        // Images: self + data URIs (Leaflet markers) + tile servers + Firebase Storage
        [
          "img-src 'self'",
          'data:',
          'blob:',
          'https://*.tile.openstreetmap.org',
          'https://*.tile.opentopomap.org',
          'https://mapsneu.wien.gv.at',
          'https://tiles.lfrz.gv.at',
          'https://gisenterprise.bgld.gv.at',
          'https://firebasestorage.googleapis.com',
        ].join(' '),
        // Fonts: self + Google Fonts
        "font-src 'self' https://fonts.gstatic.com",
        // Connect: API calls to Firebase, Google APIs, tile servers, etc.
        [
          "connect-src 'self'",
          'https://*.googleapis.com',
          'https://*.firebaseio.com',
          'https://*.firebaseapp.com',
          'wss://*.firebaseio.com',
          'https://firebasestorage.googleapis.com',
          'https://*.tile.openstreetmap.org',
          'https://*.tile.opentopomap.org',
          'https://mapsneu.wien.gv.at',
          'https://tiles.lfrz.gv.at',
          'https://gisenterprise.bgld.gv.at',
          'https://unpkg.com',
        ].join(' '),
        // Frames: none (we don't embed iframes)
        "frame-src 'self'",
        // Workers: self for service worker
        "worker-src 'self'",
        // Media: self for audio recording (AI assistant)
        "media-src 'self' blob:",
        // Object/base: none
        "object-src 'none'",
        "base-uri 'self'",
        // Form submissions
        "form-action 'self'",
        // Manifest for PWA
        "manifest-src 'self'",
      ];

      const csp = cspDirectives.join('; ');

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
            {
              key: 'Content-Security-Policy',
              value: csp,
            },
          ],
        },
      ];
    },
    images: {
      localPatterns: [
        {
          pathname: '/api/icons/**',
        },
        {
          pathname: '/api/fzg',
        },
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

  // add phase === PHASE_DEVELOPMENT_SERVER || for dev serwist
  if (phase === PHASE_PRODUCTION_BUILD) {
    const withSerwist = (await import('@serwist/next')).default({
      // Note: This is only an example. If you use Pages Router,
      // use something else that works, such as "service-worker/index.ts".
      swSrc: 'src/worker/index.ts',
      swDest: 'public/firebase-messaging-sw.js',
      swUrl: 'firebase-messaging-sw.js',
    });
    return withSerwist(nextConfig);
  }

  return nextConfig;
};
