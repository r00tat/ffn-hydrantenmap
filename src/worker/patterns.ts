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

/**
 * Eigene Caching-Regeln. Sie werden in `index.ts` **vor** Serwists
 * `defaultCache` eingehängt und gewinnen damit jeden Konflikt — die erste
 * passende Regel entscheidet.
 *
 * Daraus folgt die Regel für dieses Modul: **jeder Matcher wird so eng gefasst
 * wie möglich.** Trifft eine Regel mehr, als sie meint, verdrängt sie eine
 * passendere aus `defaultCache` — ohne dass irgendwo ein Fehler auftaucht. Genau
 * so kamen die beiden Google-Fonts-Stylesheets aus dem Root-Layout nie mehr aus
 * dem Cache: das Muster war auf `*.googleapis.com` gefasst und nahm
 * `fonts.googleapis.com` mit.
 *
 * Zwei Eigenheiten der Auswertung gehören dazu (`RegExpRoute` in serwist):
 *
 * - Bei einer **Fremd-Origin** zählt ein Regex-Treffer nur, wenn er bei Index 0
 *   beginnt. Ein zu weites Muster ist dort also von sich aus entschärft.
 * - Bei der **eigenen Origin** zählt ein Treffer an jeder Stelle der URL. `/icons\/`
 *   als Regex erfasste damit auch `/_next/static/media/icons/…`. Für eigene
 *   Pfade steht deshalb ein Funktions-Matcher mit `pathname.startsWith(…)` hier,
 *   kein Regex.
 */
export const cachePatterns: RuntimeCaching[] = [
  // Terrain-Kacheln des eigenen Höhenmodells.
  //
  // **Diese Regel muss vor der googleapis-Regel darunter stehen.** Firebase
  // Storage liegt auf `firebasestorage.googleapis.com`, fällt also unter deren
  // `NetworkOnly` — die Kacheln kämen nie in den Cache, und zwar ohne dass
  // irgendwo ein Fehler auftaucht. Genau der Cache trägt aber den
  // Hochwasserfall, in dem das Netz schlecht ist.
  //
  // Eigener `ExpirationPlugin` statt `oneDayCachePlugin`: 64 Einträge und ein
  // Tag sind für Höhenkacheln unbrauchbar. 512 Einträge fassen die
  // landesweite Übersichtsstufe plus einen Arbeitsvorrat an Detailblöcken,
  // und 90 Tage passen dazu, dass der Kachelpfad versioniert ist — die
  // Inhalte ändern sich innerhalb einer Version nicht.
  //
  // Funktions-Matcher und kein Regex: geprüft werden Host und Pfad getrennt.
  {
    matcher: ({ url }) =>
      url.hostname === 'firebasestorage.googleapis.com' &&
      url.pathname.includes('/o/terrain%2F'),
    handler: new CacheFirst({
      cacheName: 'terrain',
      plugins: [
        new ExpirationPlugin({
          maxEntries: 512,
          maxAgeSeconds: 60 * 60 * 24 * 90,
          purgeOnQuotaError: true,
        }),
      ],
    }),
  },

  // Google-APIs nie zwischenspeichern: Serwists Rückfall für Fremd-Origins
  // (`cross-origin`, NetworkFirst) legte sonst Firestore-Antworten in den
  // Cache. Zwei Einzelheiten sind Absicht und dürfen nicht wegvereinfacht
  // werden:
  //
  // `fonts.googleapis.com` ist ausgenommen. Die beiden Stylesheets im
  // Root-Layout blockieren das Rendern; unter `NetworkOnly` konnten sie bei
  // keinem Kaltstart aus dem Cache kommen. Serwist versorgt diesen Host selbst
  // mit `StaleWhileRevalidate` — dieser Regel gehört er nicht.
  //
  // Kein `networkTimeoutSeconds`. Firestores `Listen`-Kanal ist eine
  // langlebige Verbindung, die länger offen steht als jedes sinnvolle Timeout;
  // ein Abbruch nach 10 s riss sie regelmäßig auf und das SDK lief in
  // Backoff-Wiederholungen.
  {
    matcher: /^https:\/\/(?!fonts\.)[^/]+\.googleapis\.com\//i,
    handler: new NetworkOnly(),
  },

  // Die anmeldefreie Gastseite darf nie aus dem Cache kommen: ein Mitglied mit
  // installierter PWA bekäme sonst das HTML eines inzwischen widerrufenen
  // Links serviert. Ohne diesen Eintrag greift Serwists Standard (NetworkFirst
  // für Navigationen), der genau das täte.
  {
    matcher: ({ sameOrigin, url }) =>
      sameOrigin && url.pathname.startsWith('/fahrtenbuch/teilen/'),
    handler: new NetworkOnly(),
  },

  // Funktions-Matcher auf den Pfad statt Regex: als `/icons\//` erfasste die
  // Regel jede URL der eigenen Origin, die `icons/` irgendwo enthält — etwa
  // `/_next/static/media/icons/…`, das damit im Icon-Cache statt unter den
  // Regeln für gebaute Assets landete.
  {
    matcher: ({ sameOrigin, url }) =>
      sameOrigin && url.pathname.startsWith('/icons/'),
    handler: new CacheFirst({
      cacheName: 'icons',
      plugins: [oneDayCachePlugin],
    }),
  },

  {
    matcher: /^https:\/\/mapsneu\.wien\.gv\.at\/basemap\//i,
    handler: new CacheFirst({
      cacheName: 'basemap',
      plugins: [oneDayCachePlugin],
    }),
  },
  {
    matcher: /^https:\/\/tiles\.lfrz\.gv\.at\//i,
    handler: new CacheFirst({
      cacheName: 'wisa',
      plugins: [oneDayCachePlugin],
    }),
  },
  {
    matcher: /^https:\/\/[a-z]\.tile\.openstreetmap\.org\//i,
    handler: new CacheFirst({
      cacheName: 'osm',
      plugins: [oneDayCachePlugin],
    }),
  },
  {
    matcher: /^https:\/\/[a-z]\.tile\.opentopomap\.org\//i,
    handler: new CacheFirst({
      cacheName: 'opentopomap',
      plugins: [oneDayCachePlugin],
    }),
  },

  // `fonts.gstatic.com` ist ausgenommen, weil Serwist dafür eine bessere Regel
  // mitbringt: `google-fonts-webfonts` hält Schriftdateien ein Jahr, gemessen
  // ab letzter Verwendung. Diese Regel stand davor und setzte sie auf einen Tag
  // herunter — die Schriften wurden also täglich neu geladen.
  {
    matcher: /^https:\/\/(?!fonts\.)[^/]+\.gstatic\.com\//i,
    handler: new CacheFirst({
      cacheName: 'gstatic',
      plugins: [oneDayCachePlugin],
    }),
  },
  {
    matcher: /^https:\/\/unpkg\.com\//i,
    handler: new CacheFirst({
      cacheName: 'unpkg',
      plugins: [oneDayCachePlugin],
    }),
  },
];
