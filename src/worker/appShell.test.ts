import { describe, expect, it, vi } from 'vitest';
import {
  APP_SHELL_CACHE_PREFIX,
  APP_SHELL_MAX_ENTRIES,
  FAST_NAVIGATION_TIMEOUT_MS,
  LEGACY_RSC_CACHES,
  NAVIGATION_TIMEOUT_MS,
  OFFLINE_FALLBACK_HEADER,
  OFFLINE_PAGE_PATH,
  RECENT_FAILURE_WINDOW_MS,
  WARM_CONCURRENCY,
  appShellCacheName,
  cleanupOldAppShellCaches,
  createNetworkHealth,
  handleAppShellNavigation,
  handleAppShellRsc,
  isAppShellNavigation,
  isAppShellRscRequest,
  matchInPrecache,
  parseFirecallPath,
  warmAppShell,
} from './appShell';

const ORIGIN = 'https://einsatz.example.at';

/** Minimaler Ersatz für die Cache API, genug für Schlüssel nach URL. */
class FakeCache {
  entries = new Map<string, Response>();
  async match(key: RequestInfo | URL, options?: CacheQueryOptions) {
    const url = new URL(typeof key === 'string' ? key : key instanceof URL ? key.href : key.url);
    for (const [stored, res] of this.entries) {
      const s = new URL(stored);
      const same = options?.ignoreSearch
        ? s.origin + s.pathname === url.origin + url.pathname
        : s.href === url.href;
      if (same) return res.clone();
    }
    return undefined;
  }
  async put(key: RequestInfo | URL, res: Response) {
    const url = typeof key === 'string' ? key : key instanceof URL ? key.href : key.url;
    this.entries.delete(url);
    this.entries.set(url, res);
  }
  async keys() {
    return [...this.entries.keys()].map((url) => new Request(url));
  }
  async delete(key: RequestInfo | URL) {
    const url = typeof key === 'string' ? key : key instanceof URL ? key.href : key.url;
    return this.entries.delete(url);
  }
}

function html(body: string, init: ResponseInit = {}) {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    ...init,
  });
}

function navigation(path: string) {
  // `mode: 'navigate'` lässt sich mit dem Request-Konstruktor nicht setzen;
  // für die Prüfung reicht ein Objekt mit denselben Feldern.
  return { url: ORIGIN + path, method: 'GET', mode: 'navigate' } as unknown as Request;
}

function deps(cache: FakeCache, fetchFn: (req: Request) => Promise<Response>) {
  return {
    openCache: async () => cache as unknown as Cache,
    fetchFn: vi.fn(fetchFn),
    matchPrecache: vi.fn(async () => undefined),
    timeoutMs: 1000,
  };
}

const offlineFetch = () => Promise.reject(new TypeError('Failed to fetch'));

describe('appShellCacheName', () => {
  it('hängt die Build-ID an, damit ein neuer Build einen frischen Cache bekommt', () => {
    expect(appShellCacheName('abc123')).toBe(`${APP_SHELL_CACHE_PREFIX}abc123`);
    expect(appShellCacheName(undefined)).toBe(`${APP_SHELL_CACHE_PREFIX}local`);
  });
});

describe('isAppShellNavigation', () => {
  const check = (path: string, overrides: Partial<Request> = {}) =>
    isAppShellNavigation({
      request: { ...navigation(path), ...overrides } as Request,
      url: new URL(ORIGIN + path),
      sameOrigin: true,
    });

  it('nimmt Navigationen auf eigene Seiten', () => {
    expect(check('/')).toBe(true);
    expect(check('/einsatz/abcdefghijklmnopqrst/tagebuch')).toBe(true);
  });

  it('lässt API, Anmeldung, OAuth und die Gastseite aus', () => {
    expect(check('/api/ping')).toBe(false);
    expect(check('/__/auth/handler')).toBe(false);
    expect(check('/oauth/consent')).toBe(false);
    expect(check('/fahrtenbuch/teilen/token')).toBe(false);
    expect(check('/serwist/sw.js')).toBe(false);
  });

  it('nimmt nur GET-Navigationen', () => {
    expect(check('/', { method: 'POST' } as Partial<Request>)).toBe(false);
    expect(check('/', { mode: 'cors' } as Partial<Request>)).toBe(false);
  });

  it('nimmt keine fremde Origin', () => {
    expect(
      isAppShellNavigation({
        request: navigation('/'),
        url: new URL('https://example.org/'),
        sameOrigin: false,
      }),
    ).toBe(false);
  });
});

describe('parseFirecallPath', () => {
  it('erkennt Einsatz-ID und Rest', () => {
    expect(parseFirecallPath('/einsatz/abcdefghijklmnopqrst/tagebuch')).toEqual({
      id: 'abcdefghijklmnopqrst',
      rest: '/tagebuch',
    });
    expect(parseFirecallPath('/einsatz/abcdefghijklmnopqrst')).toEqual({
      id: 'abcdefghijklmnopqrst',
      rest: '',
    });
  });

  it('nimmt keine kurzen IDs, die auch in anderem Text vorkommen könnten', () => {
    expect(parseFirecallPath('/einsatz/abc/tagebuch')).toBeNull();
    expect(parseFirecallPath('/einsaetze')).toBeNull();
  });
});

describe('handleAppShellNavigation', () => {
  it('liefert online die Antwort vom Netz und legt sie in den Cache', async () => {
    const cache = new FakeCache();
    const d = deps(cache, async () => html('<p>neu</p>'));
    const res = await handleAppShellNavigation(navigation('/einsaetze'), d);
    expect(await res.text()).toBe('<p>neu</p>');
    expect(await (await cache.match(`${ORIGIN}/einsaetze`))?.text()).toBe('<p>neu</p>');
  });

  it('legt Umleitungen und Fehlerseiten nicht in den Cache', async () => {
    const cache = new FakeCache();
    const redirected = html('<p>login</p>');
    Object.defineProperty(redirected, 'redirected', { value: true });
    await handleAppShellNavigation(navigation('/a'), deps(cache, async () => redirected));
    await handleAppShellNavigation(
      navigation('/b'),
      deps(cache, async () => html('nicht da', { status: 404 })),
    );
    expect(cache.entries.size).toBe(0);
  });

  it('liefert offline die vorgehaltene Seite', async () => {
    const cache = new FakeCache();
    await cache.put(`${ORIGIN}/tagebuch`, html('<p>tagebuch</p>'));
    const res = await handleAppShellNavigation(navigation('/tagebuch'), deps(cache, offlineFetch));
    expect(await res.text()).toBe('<p>tagebuch</p>');
  });

  it('wartet nicht ewig auf ein hängendes Netz (WLAN ohne Internet)', async () => {
    vi.useFakeTimers();
    try {
      const cache = new FakeCache();
      await cache.put(`${ORIGIN}/tagebuch`, html('<p>tagebuch</p>'));
      const pending = handleAppShellNavigation(
        navigation('/tagebuch'),
        deps(cache, () => new Promise<Response>(() => {})),
      );
      await vi.advanceTimersByTimeAsync(1000);
      expect(await (await pending).text()).toBe('<p>tagebuch</p>');
    } finally {
      vi.useRealTimers();
    }
  });

  it('fällt bei einem Serverfehler auf den Cache zurück', async () => {
    const cache = new FakeCache();
    await cache.put(`${ORIGIN}/`, html('<p>karte</p>'));
    const res = await handleAppShellNavigation(
      navigation('/'),
      deps(cache, async () => new Response('bad gateway', { status: 502 })),
    );
    expect(await res.text()).toBe('<p>karte</p>');
  });

  it('baut die Seite eines offline angelegten Einsatzes aus der eines anderen', async () => {
    // Der neue Einsatz hat seine ID auf dem Gerät bekommen; seine Seiten
    // konnte niemand vorher abrufen. Die Einsatz-ID steht im HTML (Pfad und
    // RSC-Daten) und wird ersetzt.
    const cache = new FakeCache();
    const other = 'AAAAAAAAAAAAAAAAAAAA';
    const fresh = 'BBBBBBBBBBBBBBBBBBBB';
    await cache.put(
      `${ORIGIN}/einsatz/${other}/tagebuch`,
      html(`<script>["firecallId","${other}","d"]</script><a href="/einsatz/${other}/tagebuch">`),
    );
    const res = await handleAppShellNavigation(
      navigation(`/einsatz/${fresh}/tagebuch`),
      deps(cache, offlineFetch),
    );
    const text = await res.text();
    expect(text).not.toContain(other);
    expect(text).toContain(`"firecallId","${fresh}"`);
    expect(res.headers.get('Content-Type')).toContain('text/html');
  });

  it('nimmt als Vorlage nur dieselbe Unterseite', async () => {
    const cache = new FakeCache();
    await cache.put(`${ORIGIN}/einsatz/AAAAAAAAAAAAAAAAAAAA/atemschutz`, html('atemschutz'));
    await cache.put(`${ORIGIN}${OFFLINE_PAGE_PATH}`, html('offline-seite'));
    const res = await handleAppShellNavigation(
      navigation('/einsatz/BBBBBBBBBBBBBBBBBBBB/tagebuch'),
      deps(cache, offlineFetch),
    );
    expect(await res.text()).toBe('offline-seite');
  });

  it('zeigt die vorgehaltene Offline-Seite für eine unbekannte Seite', async () => {
    const cache = new FakeCache();
    await cache.put(`${ORIGIN}${OFFLINE_PAGE_PATH}`, html('offline-seite'));
    const res = await handleAppShellNavigation(navigation('/kostenersatz'), deps(cache, offlineFetch));
    expect(await res.text()).toBe('offline-seite');
  });

  it('nimmt für eine Adresse mit Query die vorgehaltene Seite ohne Query', async () => {
    const cache = new FakeCache();
    await cache.put(`${ORIGIN}/map`, html('karte'));
    await cache.put(`${ORIGIN}${OFFLINE_PAGE_PATH}`, html('offline-seite'));
    const res = await handleAppShellNavigation(
      navigation('/map?lat=47.9&lng=16.8'),
      deps(cache, offlineFetch),
    );
    expect(await res.text()).toBe('karte');
  });

  it('meldet Erfolg und Ausfall des Netzes', async () => {
    const onNetworkResult = vi.fn();
    const cache = new FakeCache();
    await handleAppShellNavigation(navigation('/'), {
      ...deps(cache, offlineFetch),
      onNetworkResult,
    });
    await handleAppShellNavigation(navigation('/'), {
      ...deps(cache, async () => html('ok')),
      onNetworkResult,
    });
    expect(onNetworkResult.mock.calls).toEqual([[false], [true]]);
  });

  it('fragt vorher den Precache dieses Builds', async () => {
    const cache = new FakeCache();
    const d = deps(cache, offlineFetch);
    d.matchPrecache.mockResolvedValueOnce(html('aus dem precache') as never);
    const res = await handleAppShellNavigation(navigation('/wetter/1'), d);
    expect(await res.text()).toBe('aus dem precache');
  });

  it('sucht nur im Precache, nicht in Runtime-Caches mit HTML früherer Builds', async () => {
    const precache = new FakeCache();
    const others = new FakeCache();
    await others.put(`${ORIGIN}/fahrtenbuch`, html('altes html'));
    const storage = {
      keys: async () => ['others', 'serwist-precache-v2-https://einsatz.example.at/'],
      open: async (name: string) =>
        (name === 'others' ? others : precache) as unknown as Cache,
    };
    const req = navigation('/fahrtenbuch');
    expect(await matchInPrecache(req, storage)).toBeUndefined();

    await precache.put(`${ORIGIN}/fahrtenbuch`, html('aus dem precache'));
    const found = await matchInPrecache(req, storage);
    expect(await found?.text()).toBe('aus dem precache');
  });

  it('liefert ohne jeden Cache eine eingebaute Offline-Seite statt eines Netzfehlers', async () => {
    const res = await handleAppShellNavigation(navigation('/'), {
      ...deps(new FakeCache(), offlineFetch),
      openCache: async () => {
        throw new Error('no cache storage');
      },
    });
    expect(res.status).toBe(503);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    expect(await res.text()).toMatch(/offline/i);
  });

  it('kennzeichnet die eingebaute Offline-Seite für die Android-App', async () => {
    // Die App zeigt bei einer 5xx-Antwort der Hauptseite einen nativen
    // Fehlerdialog. Über der eingebauten Seite, die selbst „Erneut versuchen"
    // anbietet, wäre der nur ein zweiter, verdeckender Hinweis.
    const res = await handleAppShellNavigation(navigation('/'), {
      ...deps(new FakeCache(), offlineFetch),
      openCache: async () => {
        throw new Error('no cache storage');
      },
    });
    expect(res.headers.get(OFFLINE_FALLBACK_HEADER)).toBe('1');
    // Daran erkennt die App, dass eine Seite mit eigenem „Erneut versuchen"
    // steht und kein natives Overlay nötig ist (`OfflineLoadPolicy.PROBE_SCRIPT`).
    expect(await res.text()).toContain('<meta name="einsatzkarte-offline">');
  });

  it('kennzeichnet eine echte 5xx-Antwort des Servers nicht', async () => {
    const res = await handleAppShellNavigation(
      navigation('/'),
      deps(new FakeCache(), async () => new Response('kaputt', { status: 502 })),
    );
    expect(res.status).toBe(502);
    expect(res.headers.get(OFFLINE_FALLBACK_HEADER)).toBeNull();
  });
});

function warmDeps(cache: FakeCache, fetchFn: (req: Request) => Promise<Response>) {
  return {
    openCache: async () => cache as unknown as Cache,
    fetchFn: vi.fn(fetchFn),
    origin: ORIGIN,
  };
}

describe('warmAppShell', () => {
  it('ruft die Seiten ab und legt sie in den Cache', async () => {
    const cache = new FakeCache();
    const d = warmDeps(cache, async (req) => html(`seite ${new URL(req.url).pathname}`));
    const result = await warmAppShell(['/', '/tagebuch', '/'], d);
    expect(result).toEqual({ cached: 2, present: 0, failed: [], rejected: [] });
    expect(d.fetchFn).toHaveBeenCalledTimes(2);
    expect(await (await cache.match(`${ORIGIN}/tagebuch`))?.text()).toBe('seite /tagebuch');
  });

  it('überspringt Seiten, die dieser Build schon vorhält', async () => {
    // Jeder Seitenstart wärmt erneut vor. Ohne Überspringen holte das jedes
    // Mal rund hundert Seiten, und ein abgebrochener Lauf finge von vorne an.
    const cache = new FakeCache();
    await cache.put(`${ORIGIN}/tagebuch`, html('alt'));
    const d = warmDeps(cache, async () => html('neu'));
    const result = await warmAppShell(['/tagebuch', '/atemschutzueberwachung'], d);
    expect(result).toEqual({ cached: 1, present: 1, failed: [], rejected: [] });
    expect(d.fetchFn).toHaveBeenCalledTimes(1);
    expect(await (await cache.match(`${ORIGIN}/tagebuch`))?.text()).toBe('alt');
  });

  it('trennt vorübergehende Fehler von Antworten ohne Seite', async () => {
    const cache = new FakeCache();
    const d = warmDeps(cache, async (req) => {
      const path = new URL(req.url).pathname;
      if (path === '/kaputt') return html('x', { status: 500 });
      if (path === '/offline-netz') throw new TypeError('Failed to fetch');
      if (path === '/fehlt') return html('x', { status: 404 });
      if (path === '/umgeleitet') {
        const res = html('x');
        Object.defineProperty(res, 'redirected', { value: true });
        return res;
      }
      return html('ok');
    });
    const result = await warmAppShell(
      ['/kaputt', 'https://example.org/', '/offline-netz', '/fehlt', '/umgeleitet', '/ok'],
      d,
    );
    expect(result.cached).toBe(1);
    expect(result.failed).toEqual(['/kaputt', '/offline-netz']);
    expect(result.rejected).toEqual(['/fehlt', '/umgeleitet']);
    expect(d.fetchFn).toHaveBeenCalledTimes(5);
  });

  it(`ruft höchstens ${WARM_CONCURRENCY} Seiten gleichzeitig ab`, async () => {
    const cache = new FakeCache();
    let running = 0;
    let peak = 0;
    const d = warmDeps(cache, async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running--;
      return html('ok');
    });
    const urls = Array.from({ length: 8 }, (_, i) => `/seite/${i}`);
    const result = await warmAppShell(urls, d);
    expect(result.cached).toBe(8);
    expect(peak).toBe(WARM_CONCURRENCY);
  });

  it(`hält höchstens ${APP_SHELL_MAX_ENTRIES} Einträge und opfert zuerst alte Einsatzseiten`, async () => {
    const cache = new FakeCache();
    await cache.put(`${ORIGIN}/atemschutzueberwachung`, html('allgemein'));
    for (let i = 0; i < APP_SHELL_MAX_ENTRIES; i++) {
      const id = `E${String(i).padStart(19, '0')}`;
      await cache.put(`${ORIGIN}/einsatz/${id}/tagebuch`, html('einsatz'));
    }
    await warmAppShell(['/neu'], warmDeps(cache, async () => html('neu')));
    expect(cache.entries.size).toBe(APP_SHELL_MAX_ENTRIES);
    // Die Seite ohne Einsatz ist die älteste, bleibt aber: Sie gilt für jeden
    // Einsatz und wird nur einmal je Build abgerufen.
    expect(cache.entries.has(`${ORIGIN}/atemschutzueberwachung`)).toBe(true);
    expect(cache.entries.has(`${ORIGIN}/einsatz/E0000000000000000000/tagebuch`)).toBe(false);
    expect(cache.entries.has(`${ORIGIN}/neu`)).toBe(true);
  });

  it('reicht für alle Seiten ohne Einsatz und mehrere Einsätze', () => {
    expect(APP_SHELL_MAX_ENTRIES).toBeGreaterThanOrEqual(200);
  });
});

describe('isAppShellRscRequest', () => {
  const rsc = (path: string, init: { method?: string; prefetch?: boolean } = {}) => {
    const headers = new Headers({ RSC: '1' });
    if (init.prefetch) headers.set('Next-Router-Prefetch', '1');
    return {
      request: new Request(ORIGIN + path, { method: init.method ?? 'GET', headers }),
      url: new URL(ORIGIN + path),
      sameOrigin: true,
    };
  };

  it('nimmt RSC-Abrufe eigener Seiten, auch Prefetches', () => {
    expect(isAppShellRscRequest(rsc('/einsatz/AAAAAAAAAAAAAAAAAAAA/atemschutzueberwachung?_rsc=x1'))).toBe(true);
    expect(isAppShellRscRequest(rsc('/tagebuch?_rsc=x1', { prefetch: true }))).toBe(true);
  });

  it('lässt Server Actions, API und fremde Origins aus', () => {
    expect(isAppShellRscRequest(rsc('/tagebuch', { method: 'POST' }))).toBe(false);
    expect(isAppShellRscRequest(rsc('/api/einsatz'))).toBe(false);
    expect(isAppShellRscRequest({ ...rsc('/tagebuch'), sameOrigin: false })).toBe(false);
  });

  it('nimmt keine gewöhnlichen Abrufe', () => {
    const request = new Request(`${ORIGIN}/tagebuch`);
    expect(isAppShellRscRequest({ request, url: new URL(request.url), sameOrigin: true })).toBe(false);
  });
});

describe('handleAppShellRsc', () => {
  const request = () => new Request(`${ORIGIN}/atemschutzueberwachung?_rsc=x1`, { headers: { RSC: '1' } });

  it('reicht online die Antwort des Servers durch', async () => {
    const onNetworkResult = vi.fn();
    const res = await handleAppShellRsc(request(), {
      fetchFn: async () => new Response('0:rsc', { headers: { 'Content-Type': 'text/x-component' } }),
      timeoutMs: 1000,
      onNetworkResult,
    });
    expect(await res.text()).toBe('0:rsc');
    expect(onNetworkResult).toHaveBeenCalledWith(true);
  });

  it('antwortet offline mit 503, damit Next.js hart navigiert und die App-Shell greift', async () => {
    const onNetworkResult = vi.fn();
    const res = await handleAppShellRsc(request(), {
      fetchFn: offlineFetch,
      timeoutMs: 1000,
      onNetworkResult,
    });
    expect(res.status).toBe(503);
    expect(res.headers.get('Content-Type')).not.toContain('text/x-component');
    expect(onNetworkResult).toHaveBeenCalledWith(false);
  });

  it('wartet nicht ewig auf ein hängendes Netz (WLAN ohne Internet)', async () => {
    vi.useFakeTimers();
    try {
      const pending = handleAppShellRsc(request(), {
        fetchFn: () => new Promise<Response>(() => {}),
        timeoutMs: 1000,
      });
      await vi.advanceTimersByTimeAsync(1000);
      expect((await pending).status).toBe(503);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('createNetworkHealth', () => {
  it('verkürzt die Zeitgrenze kurz nach einem Ausfall', () => {
    let now = 1_000_000;
    const health = createNetworkHealth(() => now);
    expect(health.timeoutMs()).toBe(NAVIGATION_TIMEOUT_MS);
    // Ein RSC-Abruf ist gerade gescheitert; die harte Navigation danach soll
    // nicht noch einmal acht Sekunden warten.
    health.report(false);
    expect(health.timeoutMs()).toBe(FAST_NAVIGATION_TIMEOUT_MS);
    now += RECENT_FAILURE_WINDOW_MS + 1;
    expect(health.timeoutMs()).toBe(NAVIGATION_TIMEOUT_MS);
  });

  it('kehrt nach einem Erfolg sofort zur vollen Zeitgrenze zurück', () => {
    const health = createNetworkHealth(() => 0);
    health.report(false);
    health.report(true);
    expect(health.timeoutMs()).toBe(NAVIGATION_TIMEOUT_MS);
  });
});

describe('cleanupOldAppShellCaches', () => {
  it('löscht die App-Shell früherer Builds und lässt alles andere stehen', async () => {
    const names = [appShellCacheName('alt'), appShellCacheName('neu'), 'terrain', 'others'];
    const deleted: string[] = [];
    await cleanupOldAppShellCaches(appShellCacheName('neu'), {
      keys: async () => names,
      delete: async (name: string) => {
        deleted.push(name);
        return true;
      },
    });
    expect(deleted).toEqual([appShellCacheName('alt')]);
  });

  it('löscht die RSC-Caches, die Serwist früher gefüllt hat', async () => {
    // Sie hielten RSC-Daten früherer Builds; seit der eigenen RSC-Regel liest
    // sie niemand mehr.
    const names = [appShellCacheName('neu'), ...LEGACY_RSC_CACHES, 'others'];
    const deleted: string[] = [];
    await cleanupOldAppShellCaches(appShellCacheName('neu'), {
      keys: async () => names,
      delete: async (name: string) => {
        deleted.push(name);
        return true;
      },
    });
    expect(deleted.sort()).toEqual([...LEGACY_RSC_CACHES].sort());
  });
});
