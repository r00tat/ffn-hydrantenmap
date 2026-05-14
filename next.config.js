// @ts-check

const {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
} = require('next/constants');
const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {(phase: string, defaultConfig: import("next").NextConfig) => Promise<import("next").NextConfig>} */
module.exports = async (phase) => {
  /** @type {import("next").NextConfig} */
  /** @type {import('next').NextConfig} */
  const nextConfig = {
    /* config options here */
    output: 'standalone',
    // dest: 'public',
    // skipWaiting: true,
    transpilePackages: ['mui-color-input'],
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

  // add phase === PHASE_DEVELOPMENT_SERVER || for dev serwist
  if (phase === PHASE_PRODUCTION_BUILD) {
    const withSerwist = (await import('@serwist/next')).default({
      // Note: This is only an example. If you use Pages Router,
      // use something else that works, such as "service-worker/index.ts".
      swSrc: 'src/worker/index.ts',
      swDest: 'public/firebase-messaging-sw.js',
      swUrl: 'firebase-messaging-sw.js',
    });
    return withNextIntl(withSerwist(nextConfig));
  }

  return withNextIntl(nextConfig);
};
