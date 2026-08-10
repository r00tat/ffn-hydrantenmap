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
