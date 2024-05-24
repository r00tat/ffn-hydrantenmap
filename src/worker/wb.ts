'use client';

import { ExpirationPlugin } from 'workbox-expiration';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkOnly } from 'workbox-strategies';

const scope = 'sw';

export function workboxSetup() {
  console.info(`[${scope}] starting workbox setup`);
  self.skipWaiting();

  // fix cache for firestore.googleapis.com
  registerRoute(
    /https:\/\/.*.googleapis.com\/.*/i,
    new NetworkOnly({
      networkTimeoutSeconds: 10,
      // plugins: [
      //   new ExpirationPlugin({
      //     maxEntries: 16,
      //     maxAgeSeconds: 60 * 60,
      //     purgeOnQuotaError: !0,
      //   }),
      // ],
    }),
    'GET'
  );

  const oneDayCachePlugin = new ExpirationPlugin({
    maxEntries: 64,
    maxAgeSeconds: 86400,
    purgeOnQuotaError: true,
  });

  console.info(`[${scope}] adding cache routes`);
  registerRoute(
    /icons\/.*/i,
    new CacheFirst({
      cacheName: 'icons',
      plugins: [oneDayCachePlugin],
    })
  );

  registerRoute(
    /https:\/\/maps[1-9].wien.gv.at\/basemap\/.*/i,
    new CacheFirst({
      cacheName: 'basemap',
      plugins: [oneDayCachePlugin],
    })
  );
  registerRoute(
    /https:\/\/[a-z].tile.openstreetmap.org\/.*/i,
    new CacheFirst({
      cacheName: 'osm',
      plugins: [oneDayCachePlugin],
    })
  );

  registerRoute(
    /https:\/\/.*.gstatic.com\/.*/i,
    new CacheFirst({
      cacheName: 'gstatic',
      plugins: [oneDayCachePlugin],
    })
  );
  registerRoute(
    /https:\/\/unpkg.com\/.*/i,
    new CacheFirst({
      cacheName: 'unpkg',
      plugins: [oneDayCachePlugin],
    })
  );
}
