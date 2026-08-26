import type { RuntimeCaching } from 'serwist';
import { CacheFirst, NetworkOnly, StaleWhileRevalidate } from 'serwist';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const APP_ORIGIN = 'https://einsatz.ffnd.at';

const BUCKET = 'ffn-utils.appspot.com';
const storageUrl = (path: string) =>
  `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(
    path,
  )}?alt=media`;

let cachePatterns: RuntimeCaching[];
let isWorkerBootstrap: (url: URL) => boolean;
let runtimeCaching: (defaults: RuntimeCaching[]) => RuntimeCaching[];
let defaultCache: RuntimeCaching[];

beforeAll(async () => {
  // `patterns.ts` ist ein Service-Worker-Modul: `ExpirationPlugin` registriert
  // beim Anlegen einen Quota-Callback und protokolliert das über serwists
  // `logger`, der ausserhalb eines `ServiceWorkerGlobalScope` `null` ist. Der
  // Zweig hängt an `NODE_ENV` und ist in Produktion aus — so wird das Modul
  // auch gebaut. Deshalb erst umstellen, dann laden.
  vi.stubEnv('NODE_ENV', 'production');
  ({ cachePatterns, isWorkerBootstrap, runtimeCaching } = await import(
    './patterns'
  ));
  ({ defaultCache } = await import('@serwist/turbopack/worker'));
});

afterAll(() => {
  vi.unstubAllEnvs();
});

/**
 * Bildet die Routenwahl von Serwist über `cachePatterns` nach.
 *
 * Wichtig ist die Sonderregel für Regex-Matcher: bei einer Fremd-Origin zählt
 * ein Treffer nur, wenn er bei Index 0 beginnt (`RegExpRoute` in serwist). Ohne
 * sie prüfte der Test etwas anderes als die Laufzeit — und genau diese Regel
 * war der Grund, dass die früheren unverankerten Muster so weit trafen.
 *
 * Geprüft wird nur die eigene Liste, nicht `[...cachePatterns, ...defaultCache]`.
 * Für Google Fonts lautet die Erwartung deshalb „keine eigene Regel greift":
 * dann kommt zur Laufzeit Serwists eigene Regel für den Host zum Zug.
 */
function ruleFor(
  list: RuntimeCaching[],
  href: string,
): RuntimeCaching | undefined {
  const url = new URL(href);
  const sameOrigin = url.origin === APP_ORIGIN;
  for (const entry of list) {
    const matcher = entry.matcher as
      | RegExp
      | ((options: { url: URL; sameOrigin: boolean }) => unknown);
    if (matcher instanceof RegExp) {
      const result = matcher.exec(url.href);
      if (result && (sameOrigin || result.index === 0)) return entry;
      continue;
    }
    if (matcher({ url, sameOrigin })) return entry;
  }
  return undefined;
}

const ownRuleFor = (href: string) => ruleFor(cachePatterns, href);

const cacheNameOf = (entry: RuntimeCaching) =>
  (entry.handler as unknown as { cacheName?: string }).cacheName ?? '';

describe('cachePatterns', () => {
  describe('Google Fonts bleibt Serwist überlassen', () => {
    // Beide Stylesheets stehen render-blockierend im Root-Layout. Die frühere
    // Regel auf `*.googleapis.com` verschluckte sie und zwang sie unter
    // NetworkOnly — sie konnten damit bei keinem Kaltstart aus dem Cache
    // kommen.
    it.each([
      'https://fonts.googleapis.com/css?family=Roboto:300,400,500,700&display=swap',
      'https://fonts.googleapis.com/icon?family=Material+Icons',
    ])('greift keine eigene Regel für %s', (href) => {
      expect(ownRuleFor(href)).toBeUndefined();
    });

    // Serwist hält die Schriftdateien ein Jahr; die frühere gstatic-Regel stand
    // davor und setzte sie auf einen Tag herunter.
    it('greift keine eigene Regel für fonts.gstatic.com', () => {
      expect(
        ownRuleFor('https://fonts.gstatic.com/s/roboto/v30/abc.woff2'),
      ).toBeUndefined();
    });
  });

  describe('Google-APIs', () => {
    it.each([
      'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel?VER=8',
      'https://securetoken.googleapis.com/v1/token?key=abc',
      'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=abc',
      'https://firebaseappcheck.googleapis.com/v1/projects/p/apps/a:exchange',
      'https://www.googleapis.com/identitytoolkit/v3/relyingparty/getProjectConfig?key=abc',
    ])('wird nie zwischengespeichert: %s', (href) => {
      expect(ownRuleFor(href)?.handler).toBeInstanceOf(NetworkOnly);
    });

    it('setzt kein Netz-Timeout auf Firestore', () => {
      // Der `Listen`-Kanal steht länger offen als jedes sinnvolle Timeout. Mit
      // den früheren 10 s riss er regelmässig ab und das SDK lief in Backoff.
      const rule = ownRuleFor(
        'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel?VER=8',
      );
      expect(
        (rule?.handler as unknown as { _networkTimeoutSeconds: number })
          ._networkTimeoutSeconds,
      ).toBe(0);
    });
  });

  describe('eigene Pfade sind auf die eigene Origin verankert', () => {
    it('erfasst die Gastseite', () => {
      expect(
        ownRuleFor(`${APP_ORIGIN}/fahrtenbuch/teilen/abc?fahrzeug=x`)?.handler,
      ).toBeInstanceOf(NetworkOnly);
    });

    it('erfasst /icons/', () => {
      const rule = ownRuleFor(`${APP_ORIGIN}/icons/taktische_zeichen/x.png`);
      expect(rule?.handler).toBeInstanceOf(CacheFirst);
      expect(cacheNameOf(rule!)).toContain('icons');
    });

    // Der eigentliche Fehler der früheren Regex-Muster: bei der eigenen Origin
    // zählt ein Treffer an jeder Stelle der URL. `/icons\//` erfasste damit
    // auch gebaute Assets und legte sie in den Icon-Cache; `/fahrtenbuch\/teilen\//`
    // hätte jede Seite erfasst, die den Pfad irgendwo im Pfadnamen trägt.
    it.each([
      `${APP_ORIGIN}/_next/static/media/icons/marker.png`,
      `${APP_ORIGIN}/docs/fahrtenbuch/teilen/anleitung`,
    ])('greift nicht, wenn der Pfad nur enthalten ist: %s', (href) => {
      expect(ownRuleFor(href)).toBeUndefined();
    });

    // Fremd-Origins waren schon vorher geschützt, weil ein Regex-Treffer dort
    // bei Index 0 beginnen muss. Bleibt als Absicherung stehen: der
    // Funktions-Matcher hat diese Sonderregel nicht und muss `sameOrigin`
    // selbst prüfen.
    it.each([
      'https://fremde.example/fahrtenbuch/teilen/abc',
      'https://fremde.example/theme/icons/x.png',
    ])('greift nicht auf %s', (href) => {
      expect(ownRuleFor(href)).toBeUndefined();
    });
  });

  describe('Kartenkacheln und Fremdskripte', () => {
    it.each([
      ['https://mapsneu.wien.gv.at/basemap/geolandbasemap/1/1/1.png', 'basemap'],
      ['https://tiles.lfrz.gv.at/wisa/1/1/1.png', 'wisa'],
      ['https://a.tile.openstreetmap.org/12/1/1.png', 'osm'],
      ['https://b.tile.opentopomap.org/12/1/1.png', 'opentopomap'],
      ['https://unpkg.com/leaflet/dist/leaflet.css', 'unpkg'],
      [
        'https://www.gstatic.com/recaptcha/releases/abc/recaptcha__de.js',
        'gstatic',
      ],
    ])('%s landet im Cache %s', (href, cache) => {
      const rule = ownRuleFor(href);
      expect(rule?.handler).toBeInstanceOf(CacheFirst);
      expect(cacheNameOf(rule!)).toContain(cache);
    });
  });

  describe('Höhenmodell', () => {
    const tile = storageUrl('terrain/v1/detail/CRS3035RES1000mN2783000E4831000.png');
    const index = storageUrl('terrain/v1/index.json');

    it('legt Kacheln unter CacheFirst in den Terrain-Cache', () => {
      const rule = ownRuleFor(tile);
      expect(rule?.handler).toBeInstanceOf(CacheFirst);
      expect(cacheNameOf(rule!)).toBe('terrain');
    });

    it('hält Kacheln 30 Tage', () => {
      const rule = ownRuleFor(tile);
      const [plugin] = (
        rule?.handler as unknown as {
          plugins: { _config: { maxAgeSeconds: number } }[];
        }
      ).plugins;
      expect(plugin._config.maxAgeSeconds).toBe(60 * 60 * 24 * 30);
    });

    // Der Index trägt bewusst `max-age=300` (docs/hoehenmodell.md). Unter
    // CacheFirst wäre das wirkungslos, und ein Nachimport bliebe auf jedem
    // Gerät, das den Index schon einmal geholt hat, für die volle Haltedauer
    // unsichtbar.
    it('nimmt den Index nicht unter CacheFirst', () => {
      const rule = ownRuleFor(index);
      expect(rule?.handler).toBeInstanceOf(StaleWhileRevalidate);
      expect(cacheNameOf(rule!)).toBe('terrain-index');
    });

    // Die Terrain-Regeln müssen vor der googleapis-Regel stehen: Firebase
    // Storage liegt auf firebasestorage.googleapis.com und fiele sonst unter
    // deren NetworkOnly — die Offlinefähigkeit wäre lautlos hin.
    it.each([tile, index])('greift vor der googleapis-Regel: %s', (href) => {
      expect(ownRuleFor(href)?.handler).not.toBeInstanceOf(NetworkOnly);
    });
  });

  describe('Turbopacks Worker-Bootstrap', () => {
    it('wird erkannt', () => {
      expect(
        isWorkerBootstrap(
          new URL(
            `${APP_ORIGIN}/_next/static/chunks/turbopack-worker-2ru9m5gbh1na6.js`,
          ),
        ),
      ).toBe(true);
    });

    it.each([
      `${APP_ORIGIN}/_next/static/chunks/3y3y_9xloi5pn.js`,
      `${APP_ORIGIN}/_next/static/chunks/turbopack-23yryw-oxwwvq.js`,
      `${APP_ORIGIN}/turbopack-worker-abc.js`,
    ])('erfasst gewöhnliches gebautes JS nicht: %s', (href) => {
      expect(isWorkerBootstrap(new URL(href))).toBe(false);
    });

    // Der Grund, warum der Chunk über einen eigenen fetch-Listener in
    // index.ts umgangen wird und nicht durch Herausfiltern einzelner Regeln:
    // in `defaultCache` beantworten ihn mehrere, darunter allgemeine
    // Auffangregeln, die für alles andere gebraucht werden.
    it('würde sonst von mehreren Regeln beantwortet', () => {
      const rule = ruleFor(
        runtimeCaching(defaultCache),
        `${APP_ORIGIN}/_next/static/chunks/turbopack-worker-2ru9m5gbh1na6.js`,
      );
      expect(rule).toBeDefined();
    });
  });

  describe('Fehlertoleranz', () => {
    // Ein Service Worker darf die Anwendung nicht schlechter stellen als gar
    // keiner. `CacheFirst` wirft `SerwistError('no-response')`, sobald der
    // Cache-Zugriff scheitert — ohne diesen Rückfall scheitert damit der
    // `fetch()` der Seite, obwohl das Netz die Antwort hätte.
    it('weicht bei einer scheiternden Strategie aufs Netz aus', async () => {
      const boom: RuntimeCaching = {
        matcher: () => true,
        handler: {
          handle: () => Promise.reject(new Error('Cache kaputt')),
        },
      };
      const netz = new Response('vom Netz');
      const fetchMock = vi.fn().mockResolvedValue(netz);
      vi.stubGlobal('fetch', fetchMock);

      const [wrapped] = runtimeCaching([boom]).slice(cachePatterns.length);
      const request = new Request(`${APP_ORIGIN}/irgendwas.js`);
      const handler = wrapped.handler as { handle: (o: unknown) => unknown };

      await expect(handler.handle({ request })).resolves.toBe(netz);
      expect(fetchMock).toHaveBeenCalledWith(request);
      vi.unstubAllGlobals();
    });
  });
});
