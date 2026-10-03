import { describe, expect, it, vi } from 'vitest';
import {
  APP_SHELL_CACHE_PREFIX,
  APP_SHELL_MAX_ENTRIES,
  OFFLINE_PAGE_PATH,
  appShellCacheName,
  cleanupOldAppShellCaches,
  handleAppShellNavigation,
  isAppShellNavigation,
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
    matchAnyCache: vi.fn(async () => undefined),
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

  it('fragt vorher die übrigen Caches (Seiten aus früheren Besuchen)', async () => {
    const cache = new FakeCache();
    const d = deps(cache, offlineFetch);
    d.matchAnyCache.mockResolvedValueOnce(html('aus anderem cache') as never);
    const res = await handleAppShellNavigation(navigation('/wetter/1'), d);
    expect(await res.text()).toBe('aus anderem cache');
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
});

describe('warmAppShell', () => {
  it('ruft die Seiten ab und legt sie in den Cache', async () => {
    const cache = new FakeCache();
    const fetchFn = vi.fn(async (req: Request) => html(`seite ${new URL(req.url).pathname}`));
    const result = await warmAppShell(['/', '/tagebuch', '/'], {
      openCache: async () => cache as unknown as Cache,
      fetchFn,
      origin: ORIGIN,
    });
    expect(result).toEqual({ cached: 2, failed: [] });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(await (await cache.match(`${ORIGIN}/tagebuch`))?.text()).toBe('seite /tagebuch');
  });

  it('meldet gescheiterte Seiten und lässt fremde Adressen aus', async () => {
    const cache = new FakeCache();
    const fetchFn = vi.fn(async (req: Request) =>
      new URL(req.url).pathname === '/kaputt' ? html('x', { status: 500 }) : html('ok'),
    );
    const result = await warmAppShell(['/kaputt', 'https://example.org/', '/ok'], {
      openCache: async () => cache as unknown as Cache,
      fetchFn,
      origin: ORIGIN,
    });
    expect(result.cached).toBe(1);
    expect(result.failed).toEqual(['/kaputt']);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it(`hält höchstens ${APP_SHELL_MAX_ENTRIES} Einträge und wirft die ältesten hinaus`, async () => {
    const cache = new FakeCache();
    for (let i = 0; i < APP_SHELL_MAX_ENTRIES; i++) {
      await cache.put(`${ORIGIN}/alt/${i}`, html('alt'));
    }
    await warmAppShell(['/neu'], {
      openCache: async () => cache as unknown as Cache,
      fetchFn: async () => html('neu'),
      origin: ORIGIN,
    });
    expect(cache.entries.size).toBe(APP_SHELL_MAX_ENTRIES);
    expect(cache.entries.has(`${ORIGIN}/alt/0`)).toBe(false);
    expect(cache.entries.has(`${ORIGIN}/neu`)).toBe(true);
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
});
