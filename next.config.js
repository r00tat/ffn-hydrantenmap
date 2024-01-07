/** @type {import('next').NextConfig} */
// const { InjectManifest } = require('workbox-webpack-plugin');

const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  // register: true,
  // scope: '/app',
  sw: 'firebase-messaging-sw.js',
  skipWaiting: false,
  //...
});

module.exports = withPWA({
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
    ],
  },
  // webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
  //   if (!isServer) {
  //     config.plugins.push(
  //       new InjectManifest({
  //         swSrc: './src/service-workers/firebase-messaging-sw.ts',
  //         swDest: '../public/firebase-messaging-sw.js',
  //         include: [],
  //       })
  //     );
  //   }

  //   return config;
  // },
});
