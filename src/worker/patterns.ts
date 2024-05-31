'use client';

import {
  CacheFirst,
  ExpirationPlugin,
  NetworkOnly,
  RuntimeCaching,
} from 'serwist';

const oneDayCachePlugin = new ExpirationPlugin({
  maxEntries: 64,
  maxAgeSeconds: 86400,
  purgeOnQuotaError: true,
});

export const cachePatterns: RuntimeCaching[] = [
  // fix cache for firestore.googleapis.com
  {
    matcher: /https:\/\/.*.googleapis.com\/.*/i,
    handler: new NetworkOnly({
      networkTimeoutSeconds: 10,
      // plugins: [
      //   new ExpirationPlugin({
      //     maxEntries: 16,
      //     maxAgeSeconds: 60 * 60,
      //     purgeOnQuotaError: !0,
      //   }),
      // ],
    }),
    // method: 'GET'
  },

  {
    matcher: /icons\/.*/i,
    handler: new CacheFirst({
      cacheName: 'icons',
      plugins: [oneDayCachePlugin],
    }),
  },

  {
    matcher: /https:\/\/maps[1-9].wien.gv.at\/basemap\/.*/i,
    handler: new CacheFirst({
      cacheName: 'basemap',
      plugins: [oneDayCachePlugin],
    }),
  },
  {
    matcher: /https:\/\/[a-z].tile.openstreetmap.org\/.*/i,
    handler: new CacheFirst({
      cacheName: 'osm',
      plugins: [oneDayCachePlugin],
    }),
  },

  {
    matcher: /https:\/\/.*.gstatic.com\/.*/i,
    handler: new CacheFirst({
      cacheName: 'gstatic',
      plugins: [oneDayCachePlugin],
    }),
  },
  {
    matcher: /https:\/\/unpkg.com\/.*/i,
    handler: new CacheFirst({
      cacheName: 'unpkg',
      plugins: [oneDayCachePlugin],
    }),
  },
];
