import type { RuntimeCaching } from 'serwist';
import { CacheFirst, NetworkOnly } from 'serwist';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const APP_ORIGIN = 'https://einsatz.ffnd.at';

let cachePatterns: RuntimeCaching[];

beforeAll(async () => {
  // `patterns.ts` ist ein Service-Worker-Modul: `ExpirationPlugin` registriert
  // beim Anlegen einen Quota-Callback und protokolliert das über serwists
  // `logger`, der ausserhalb eines `ServiceWorkerGlobalScope` `null` ist. Der
  // Zweig hängt an `NODE_ENV` und ist in Produktion aus — so wird das Modul
  // auch gebaut. Deshalb erst umstellen, dann laden.
  vi.stubEnv('NODE_ENV', 'production');
  ({ cachePatterns } = await import('./patterns'));
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
function ownRuleFor(href: string): RuntimeCaching | undefined {
  const url = new URL(href);
  const sameOrigin = url.origin === APP_ORIGIN;
  for (const entry of cachePatterns) {
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
});

describe('MCP- und OAuth-Endpunkte', () => {
  it('kommen nie aus dem Cache', () => {
    for (const path of [
      '/api/mcp',
      '/api/oauth/token',
      '/api/oauth/authorize?client_id=x',
      '/.well-known/oauth-protected-resource/api/mcp',
      '/.well-known/jwks.json',
    ]) {
      expect(ownRuleFor(`${APP_ORIGIN}${path}`)?.handler).toBeInstanceOf(
        NetworkOnly,
      );
    }
  });

  it('greift nicht auf andere API-Routen über', () => {
    // Für die übrigen API-Routen greift keine eigene Regel — dort entscheidet
    // Serwists `defaultCache`.
    expect(ownRuleFor(`${APP_ORIGIN}/api/hydranten`)).toBeUndefined();
  });
});
