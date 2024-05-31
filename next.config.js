// @ts-check

/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  dest: 'public',
  // disable: process.env.NODE_ENV === 'development',
  // disable: false,
  // register: true,
  // scope: '/app',
  sw: 'firebase-messaging-sw.js',
  skipWaiting: true,
};

// const { InjectManifest } = require('workbox-webpack-plugin');

// const nextPWA = require('next-pwa');

// const withPWA = nextPWA({
//   dest: 'public',
//   disable: process.env.NODE_ENV === 'development',
//   // disable: false,
//   // register: true,
//   // scope: '/app',
//   sw: 'firebase-messaging-sw.js',
//   skipWaiting: true,
// });

// module.exports = withPWA({
//   reactStrictMode: true,
//   images: {
//     remotePatterns: [
//       {
//         protocol: 'https',
//         hostname: 'firebasestorage.googleapis.com',
//       },
//     ],
//   },
//   // webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
//   //   if (!isServer) {
//   //     config.plugins.push(
//   //       new InjectManifest({
//   //         swSrc: './src/service-workers/firebase-messaging-sw.ts',
//   //         swDest: '../public/firebase-messaging-sw.js',
//   //         include: [],
//   //       })
//   //     );
//   //   }

//   //   return config;
//   // },
// });
