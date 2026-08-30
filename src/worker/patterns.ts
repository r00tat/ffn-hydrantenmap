'use client';

import {
  CacheFirst,
  ExpirationPlugin,
  NetworkOnly,
  RouteHandler,
  RuntimeCaching,
  StaleWhileRevalidate,
} from 'serwist';

const oneDayCachePlugin = new ExpirationPlugin({
  maxEntries: 64,
  maxAgeSeconds: 86400,
  purgeOnQuotaError: true,
});

/**
 * Turbopacks Bootstrap-Chunk für `new Worker(new URL(…))`.
 *
 * **Dieser Chunk darf von keiner Regel beantwortet werden.** Turbopack hängt
 * die Konfiguration des Workers bei einem dedizierten `Worker` in das
 * URL-**Fragment** (`#params=…`; nur ein `SharedWorker` bekommt sie als
 * Query-Parameter). Ein Fragment geht nie an den Server: der Service Worker
 * sieht die nackte URL, und sobald er die Anfrage beantwortet — aus dem
 * Precache, aus einem Runtime-Cache oder auch nur durchgereicht —, wird die
 * `location` des Workers aus der Response-URL gesetzt und das Fragment ist weg.
 * Der Bootstrap bricht dann mit „Missing worker bootstrap config" ab, und der
 * Höhenmodell-Worker startet überhaupt nicht.
 *
 * Der Ausweg steht in `index.ts`: ein eigener `fetch`-Listener vor dem von
 * Serwist bricht die Weitergabe für diesen Chunk ab. Ruft niemand
 * `respondWith`, holt der Browser ihn selbst — mit Fragment, genau wie ohne
 * Service Worker.
 *
 * Aus `defaultCache` einzelne Regeln zu entfernen genügt dafür **nicht**: den
 * Chunk beantworten dort vier Regeln, darunter die allgemeine für `.js` und
 * ein Auffangnetz für die eigene Origin. Sie alle zu streichen nähme dem
 * Precache-Ersatz die Grundlage und änderte das Verhalten für alles andere mit.
 */
export const isWorkerBootstrap = (url: URL): boolean =>
  url.pathname.startsWith('/_next/static/chunks/turbopack-worker-');

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
  // Der Firebase-Auth-Handler unter `/__/auth/*` liegt nur scheinbar bei uns:
  // `next.config.js` spiegelt ihn per Rewrite von der Firebase-Hosting-Domain
  // hierher, damit der Google-Login same-origin ablaufen kann (siehe
  // src/components/firebase/authDomain.ts).
  //
  // Für Serwist ist `/__/auth/handler` damit eine gewöhnliche Navigation der
  // eigenen Origin — und die beantwortet `defaultCache` mit NetworkFirst, also
  // mit Cache. Eine zwischengespeicherte Handler-Antwort trägt aber die
  // OAuth-Parameter genau eines Anmeldeversuchs; beim nächsten Login käme sie
  // erneut und der Ablauf bliebe stehen, ohne dass irgendwo ein Fehler
  // auftaucht.
  //
  // Diese Regel steht deshalb ganz vorne: Die erste passende entscheidet.
  {
    matcher: ({ sameOrigin, url }) =>
      sameOrigin && url.pathname.startsWith('/__/auth/'),
    handler: new NetworkOnly(),
  },

  // MCP- und OAuth-Endpunkte dürfen nie aus dem Cache kommen — und auch nicht
  // in ihn hinein.
  //
  // `/api/mcp` trägt in jedem Aufruf ein Access Token und antwortet mit
  // Einsatzdaten; `/.well-known/*` nennt den Issuer und den öffentlichen
  // Signaturschlüssel. Ein zwischengespeichertes Discovery-Dokument überlebt
  // einen Deploy mit geänderter Adresse und bricht dann den gesamten
  // Verbindungsaufbau, ohne dass irgendwo ein Fehler auftaucht.
  //
  // Diese Regel muss **vor** allen anderen stehen: Die erste passende
  // entscheidet, und Serwists Standard für Navigationen und JSON-Antworten
  // wäre NetworkFirst — also mit Cache.
  {
    matcher: ({ sameOrigin, url }) =>
      sameOrigin &&
      (url.pathname.startsWith('/api/mcp') ||
        url.pathname.startsWith('/api/oauth/') ||
        url.pathname.startsWith('/.well-known/')),
    handler: new NetworkOnly(),
  },

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
  // landesweite Übersichtsstufe plus einen Arbeitsvorrat an Detailblöcken.
  //
  // Funktions-Matcher und kein Regex: geprüft werden Host und Pfad getrennt.
  //
  // **Der Index gehört nicht unter `CacheFirst`** und steht deshalb als eigene
  // Regel davor. Er liegt unter demselben Prefix, trägt aber bewusst
  // `max-age=300` (siehe docs/hoehenmodell.md) — unter `CacheFirst` wäre das
  // wirkungslos und ein Gerät bekäme nach einem Nachimport für die volle
  // Haltedauer weiter die alte Verfügbarkeitsliste. Neu hinzugekommene
  // Kacheln blieben dort unsichtbar, ohne dass irgendwo ein Fehler auftaucht.
  // `StaleWhileRevalidate` liefert offline weiter aus und frischt online auf.
  {
    matcher: ({ url }) =>
      url.hostname === 'firebasestorage.googleapis.com' &&
      url.pathname.includes('/o/terrain%2F') &&
      url.pathname.endsWith('index.json'),
    handler: new StaleWhileRevalidate({
      cacheName: 'terrain-index',
      plugins: [
        new ExpirationPlugin({
          maxEntries: 4,
          maxAgeSeconds: 60 * 60 * 24 * 30,
          purgeOnQuotaError: true,
        }),
      ],
    }),
  },

  // Die Kacheln selbst. 30 Tage: der Kachelpfad ist versioniert, die Inhalte
  // ändern sich innerhalb einer Version nicht, und ein Monat trägt jede
  // Einsatzlage. Länger zu halten bindet nur Kontingent, das die
  // Übersichtsstufe für den Offlinefall braucht.
  {
    matcher: ({ url }) =>
      url.hostname === 'firebasestorage.googleapis.com' &&
      url.pathname.includes('/o/terrain%2F') &&
      url.pathname.endsWith('.png'),
    handler: new CacheFirst({
      cacheName: 'terrain',
      plugins: [
        new ExpirationPlugin({
          maxEntries: 512,
          maxAgeSeconds: 60 * 60 * 24 * 30,
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

/**
 * Eine Regel, die bei einem Fehler auf das Netz zurückfällt.
 *
 * Ohne das reicht ein Fehler in der Cache-Schicht bis in die Anwendung durch:
 * `CacheFirst` etwa wirft `SerwistError('no-response')`, sobald der
 * Cache-Zugriff scheitert, und der `fetch()` der Seite scheitert mit — obwohl
 * das Netz die Antwort hätte. Ein Service Worker darf die Anwendung nicht
 * schlechter stellen als gar keiner; im Zweifel wird also durchgereicht.
 */
function resilient(entry: RuntimeCaching): RuntimeCaching {
  const handler: RouteHandler = {
    handle: async (options) => {
      try {
        return await (typeof entry.handler === 'function'
          ? entry.handler(options)
          : entry.handler.handle(options));
      } catch (error) {
        console.warn(
          `[sw] Strategie für ${options.request.url} gescheitert, weiche aufs Netz aus`,
          error
        );
        return fetch(options.request);
      }
    },
  };
  return { ...entry, handler };
}

/**
 * Die vollständige Regelliste des Service Workers.
 *
 * Eigene Regeln zuerst — die erste passende entscheidet. Jede Regel ist
 * gegen Fehler abgesichert, siehe `resilient`.
 */
export function runtimeCaching(defaults: RuntimeCaching[]): RuntimeCaching[] {
  return [...cachePatterns, ...defaults].map(resilient);
}
