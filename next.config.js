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
