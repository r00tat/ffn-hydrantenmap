/**
 * App-Shell für den Kaltstart ohne Netz (Issue #839, Phase 5).
 *
 * Seiten kamen bisher über Serwists `defaultCache`: Navigationen fallen dort
 * in die Auffangregel `others` (NetworkFirst, 32 Einträge, ein Tag, **ohne**
 * Zeitgrenze). Im Cache lag also nur, was in den letzten 24 Stunden besucht
 * wurde, und im WLAN ohne Internet hing die Navigation, bis der Browser
 * aufgab.
 *
 * Dieses Modul hält stattdessen:
 *
 * - einen eigenen Cache je Build (`app-shell-<Build-ID>`). Das HTML verweist
 *   auf die Chunks seines Builds; nach einem Deploy räumt der neue Worker die
 *   alten aus dem Precache, ein altes HTML wäre offline also kaputt. Beim
 *   `activate` werden die App-Shells früherer Builds gelöscht
 *   (`cleanupOldAppShellCaches`), die Seite wärmt den neuen danach wieder vor.
 * - eine Navigation mit Zeitgrenze (`handleAppShellNavigation`): Netz zuerst,
 *   bei Fehler, Zeitüberschreitung oder 5xx der Cache.
 * - eine Vorlage für Einsatzseiten: Ein offline angelegter Einsatz hat seine
 *   ID auf dem Gerät bekommen, seine Seiten konnte niemand vorher abrufen. Die
 *   Seite desselben Abschnitts eines anderen Einsatzes dient als Vorlage, die
 *   Einsatz-ID darin wird ersetzt (`findTemplateFallback`).
 * - als letzten Rückfall die vorgehaltene Seite `/offline` und, wenn auch die
 *   fehlt, eine eingebaute Seite. Ein Netzfehler des Browsers („Keine
 *   Internetverbindung", Dino) sähe nach einer kaputten App aus.
 * - das Vorwärmen (`warmAppShell`), angestoßen von der Seite nach der
 *   Anmeldung, weil die Einsatzpfade dynamisch sind und der Worker sie beim
 *   Installieren nicht kennt.
 *
 * RSC-Payloads werden bewusst nicht vorgehalten: Ihr Cache-Schlüssel trägt den
 * Parameter `_rsc`, einen Hash über den Router-Zustand, der sich nicht
 * vorhersagen lässt. Scheitert der RSC-Abruf, navigiert Next.js selbst hart
 * („Falling back to browser navigation"), und diese Navigation beantwortet
 * dieses Modul. Damit das auch im WLAN ohne Internet geschieht, statt dass der
 * Klick ins Leere läuft, haben RSC-Abrufe eine eigene Regel mit Zeitgrenze
 * (`handleAppShellRsc`).
 *
 * Das Modul ist rein bis auf die übergebenen Abhängigkeiten (Cache, fetch),
 * damit es sich ohne Service Worker testen lässt.
 */
import { withTimeout } from '../lib/withTimeout';

export const APP_SHELL_CACHE_PREFIX = 'app-shell-';
export const OFFLINE_PAGE_PATH = '/offline';
/**
 * Zeitgrenze einer Navigation, bevor der Cache antwortet. Großzügiger als der
 * Ping (5 s), weil ein kalter Cloud-Run-Start länger braucht und eine
 * langsame, aber funktionierende Verbindung frische Seiten bekommen soll.
 */
export const NAVIGATION_TIMEOUT_MS = 8_000;
/**
 * Zeitgrenze, solange das Netz gerade erst ausgefallen ist. Nach einem
 * gescheiterten RSC-Abruf folgt sofort die harte Navigation; die soll nicht
 * noch einmal die volle Zeit warten.
 */
export const FAST_NAVIGATION_TIMEOUT_MS = 2_000;
/** So lange gilt ein Ausfall als „gerade eben". */
export const RECENT_FAILURE_WINDOW_MS = 30_000;
/** Zeitgrenze je Seite beim Vorwärmen. */
export const WARM_TIMEOUT_MS = 15_000;
/**
 * Gleichzeitige Abrufe beim Vorwärmen. Zwei statt einem halbieren die Dauer
 * des ersten Laufs (rund hundert Seiten), ohne der offenen Seite die Leitung
 * zu nehmen.
 */
export const WARM_CONCURRENCY = 2;
/**
 * Obergrenze des Caches. Die Seiten ohne Einsatz (rund 65) werden beim Kürzen
 * nie verdrängt, dazu passen die Seiten (je 23) mehrerer Einsätze.
 */
export const APP_SHELL_MAX_ENTRIES = 200;
/**
 * RSC-Caches von Serwists `defaultCache`. Seit der eigenen RSC-Regel liest sie
 * niemand mehr; sie hielten RSC-Daten früherer Builds und werden gelöscht.
 */
export const LEGACY_RSC_CACHES = ['pages-rsc', 'pages-rsc-prefetch'] as const;

export function appShellCacheName(buildId: string | undefined): string {
  return APP_SHELL_CACHE_PREFIX + (buildId || 'local');
}

/**
 * Pfade, die nie aus der App-Shell kommen. Für die meisten steht in
 * `patterns.ts` ohnehin eine `NetworkOnly`-Regel davor; die Liste hier hält
 * das Modul auch für sich allein richtig.
 */
const EXCLUDED_PREFIXES = [
  '/api/',
  '/__/',
  '/serwist/',
  '/oauth/',
  '/.well-known/',
  '/fahrtenbuch/teilen/',
];

interface RouteMatch {
  request: Request;
  url: URL;
  sameOrigin: boolean;
}

const isExcludedPath = (pathname: string) =>
  EXCLUDED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

export function isAppShellNavigation({ request, url, sameOrigin }: RouteMatch): boolean {
  return (
    sameOrigin &&
    request.mode === 'navigate' &&
    request.method === 'GET' &&
    !isExcludedPath(url.pathname)
  );
}

/**
 * RSC-Abruf des App Routers für eine eigene Seite (Navigation oder Prefetch).
 * Server Actions sind POST und bleiben außen vor.
 */
export function isAppShellRscRequest({ request, url, sameOrigin }: RouteMatch): boolean {
  return (
    sameOrigin &&
    request.method === 'GET' &&
    request.headers.get('RSC') === '1' &&
    !isExcludedPath(url.pathname)
  );
}

export interface NetworkHealth {
  report: (ok: boolean) => void;
  timeoutMs: () => number;
}

/**
 * Merkt sich, ob das Netz gerade ausgefallen ist, und verkürzt dann die
 * Zeitgrenze der Navigation. Lebt im Worker; nach seinem Neustart beginnt sie
 * wieder bei der vollen Zeitgrenze.
 */
export function createNetworkHealth(now: () => number = Date.now): NetworkHealth {
  let lastFailure: number | null = null;
  return {
    report(ok) {
      lastFailure = ok ? null : now();
    },
    timeoutMs() {
      return lastFailure !== null && now() - lastFailure <= RECENT_FAILURE_WINDOW_MS
        ? FAST_NAVIGATION_TIMEOUT_MS
        : NAVIGATION_TIMEOUT_MS;
    },
  };
}

/**
 * Einsatz-ID und Rest eines Einsatzpfads. Nur IDs ab 15 Zeichen: Firestore
 * vergibt 20 zufällige Zeichen, die sonst nirgends im HTML vorkommen — eine
 * kurze ID könnte beim Ersetzen beliebigen Text treffen.
 */
const FIRECALL_PATH = /^\/einsatz\/([A-Za-z0-9_-]{15,})(\/.*)?$/;

export function parseFirecallPath(
  pathname: string,
): { id: string; rest: string } | null {
  const match = FIRECALL_PATH.exec(pathname);
  if (!match) return null;
  return { id: match[1], rest: match[2] ?? '' };
}

export function isCacheableShellResponse(res: Response): boolean {
  return (
    res.status === 200 &&
    !res.redirected &&
    (res.type === 'basic' || res.type === 'default') &&
    (res.headers.get('Content-Type') ?? '').includes('text/html')
  );
}

/**
 * Kürzt auf `maxEntries`, älteste zuerst. Verdrängt werden zuerst Seiten eines
 * Einsatzes und Adressen mit Query, erst danach die Seiten ohne Einsatz: Die
 * gelten für jeden Einsatz, und das Vorwärmen holt sie nur einmal je Build.
 */
async function trimCache(cache: Cache, maxEntries: number): Promise<void> {
  const keys = await cache.keys();
  let excess = keys.length - maxEntries;
  if (excess <= 0) return;
  const isExpendable = (key: Request) => {
    const url = new URL(key.url);
    return url.search !== '' || parseFirecallPath(url.pathname) !== null;
  };
  const ordered = [
    ...keys.filter(isExpendable),
    ...keys.filter((key) => !isExpendable(key)),
  ];
  for (const key of ordered) {
    if (excess-- <= 0) break;
    await cache.delete(key);
  }
}

async function putShell(cache: Cache, key: string, res: Response): Promise<void> {
  await cache.put(key, res);
  await trimCache(cache, APP_SHELL_MAX_ENTRIES);
}

/**
 * Seite eines anderen Einsatzes mit demselben Abschnitt, die Einsatz-ID
 * ersetzt. Die ID steht im HTML im Pfad, in Links und in den RSC-Daten
 * (`"firecallId","…"`); ohne Ersetzen hydrierte die Seite mit dem falschen
 * Einsatz.
 */
export async function findTemplateFallback(
  cache: Cache,
  url: URL,
): Promise<Response | null> {
  const target = parseFirecallPath(url.pathname);
  if (!target) return null;
  for (const key of await cache.keys()) {
    const keyUrl = new URL(key.url);
    if (keyUrl.search) continue;
    const template = parseFirecallPath(keyUrl.pathname);
    if (!template || template.id === target.id || template.rest !== target.rest) {
      continue;
    }
    const res = await cache.match(key, { ignoreVary: true });
    if (!res) continue;
    const body = (await res.text()).split(template.id).join(target.id);
    const headers = new Headers(res.headers);
    headers.delete('Content-Length');
    return new Response(body, { status: 200, headers });
  }
  return null;
}

/** Eingebaute Seite, wenn nichts vorgehalten ist. Ohne fremde Ressourcen. */
export function offlineFallbackHtml(): string {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Offline – Einsatzkarte</title>
<style>
body{font-family:system-ui,sans-serif;margin:0;padding:24px;color:#222;background:#fff}
h1{font-size:1.4rem}a,button{font-size:1rem;margin:8px 8px 0 0;padding:8px 16px}
</style>
</head>
<body>
<h1>Offline</h1>
<p>Diese Seite ist ohne Internetverbindung nicht verfügbar.</p>
<p lang="en">This page is not available without an internet connection.</p>
<p><a href="/">Zur Karte / Map</a><button onclick="location.reload()">Erneut versuchen / Retry</button></p>
</body>
</html>`;
}

/** Der Ausschnitt der Cache API, den `matchInPrecache` braucht. */
export interface PrecacheStorage {
  keys: () => Promise<string[]>;
  open: (name: string) => Promise<Cache>;
}

/**
 * Sucht eine Seite nur in den Precache-Caches von Serwist
 * (`serwist-precache-…`). Deren Inhalt gehört zum aktuellen Build und wird
 * beim Aktivieren eines neuen Workers ausgetauscht.
 */
export async function matchInPrecache(
  request: Request,
  storage: PrecacheStorage,
): Promise<Response | undefined> {
  const names = (await storage.keys()).filter((name) =>
    name.includes('-precache-'),
  );
  for (const name of names) {
    const cache = await storage.open(name);
    const found = await cache.match(request, { ignoreVary: true });
    if (found) return found;
  }
  return undefined;
}

export interface NavigationDeps {
  openCache: () => Promise<Cache>;
  fetchFn: (request: Request) => Promise<Response>;
  /**
   * Suche im Precache dieses Builds (`matchInPrecache`). Bewusst nicht über
   * alle Caches: Serwists Auffangregel `others` hält HTML früherer Builds,
   * deren Chunks offline fehlen — dann lieber die Offline-Seite.
   */
  matchPrecache: (request: Request) => Promise<Response | undefined>;
  timeoutMs?: number;
  /** Ob das Netz geantwortet hat (`createNetworkHealth`). */
  onNetworkResult?: (ok: boolean) => void;
}

export async function handleAppShellNavigation(
  request: Request,
  deps: NavigationDeps,
): Promise<Response> {
  const url = new URL(request.url);
  const key = url.href;

  let network: Response | undefined;
  try {
    network = await withTimeout(
      deps.fetchFn(request),
      deps.timeoutMs ?? NAVIGATION_TIMEOUT_MS,
      `navigation ${url.pathname}`,
    );
  } catch {
    network = undefined;
  }
  deps.onNetworkResult?.(network !== undefined && network.status < 500);

  let cache: Cache | null = null;
  const getCache = async () => {
    if (!cache) cache = await deps.openCache().catch(() => null);
    return cache;
  };

  if (network && network.status < 500) {
    if (isCacheableShellResponse(network)) {
      const c = await getCache();
      if (c) {
        await putShell(c, key, network.clone()).catch((err) => {
          console.warn('[sw] App-Shell nicht gespeichert', err);
        });
      }
    }
    return network;
  }

  const c = await getCache();
  const withoutSearch = url.search ? url.origin + url.pathname : null;
  const found =
    (c && (await c.match(key, { ignoreVary: true }))) ||
    (c && withoutSearch && (await c.match(withoutSearch, { ignoreVary: true }))) ||
    (await deps.matchPrecache(request).catch(() => undefined)) ||
    (c && (await findTemplateFallback(c, url).catch(() => null))) ||
    (c &&
      (await c.match(new URL(OFFLINE_PAGE_PATH, url).href, { ignoreVary: true })));
  if (found) return found;
  if (network) return network;
  return new Response(offlineFallbackHtml(), {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export interface RscDeps {
  fetchFn: (request: Request) => Promise<Response>;
  timeoutMs: number;
  onNetworkResult?: (ok: boolean) => void;
}

/**
 * RSC-Abruf mit Zeitgrenze. Ohne Netz antwortet der Worker mit einem 503 ohne
 * RSC-Inhalt; Next.js navigiert darauf hart, und die Navigation beantwortet
 * die App-Shell. Für den Benutzer ist der Seitenwechsel damit offline wie
 * online, nur mit einem Neuladen der Seite.
 *
 * Vorher lagen RSC-Abrufe bei Serwists `NetworkFirst` ohne Zeitgrenze: Im WLAN
 * ohne Internet lief der Klick ins Leere, bis der Browser aufgab, und der
 * Cache konnte RSC-Daten eines früheren Builds liefern.
 */
export async function handleAppShellRsc(
  request: Request,
  deps: RscDeps,
): Promise<Response> {
  try {
    const res = await withTimeout(
      deps.fetchFn(request),
      deps.timeoutMs,
      `rsc ${new URL(request.url).pathname}`,
    );
    deps.onNetworkResult?.(res.status < 500);
    return res;
  } catch {
    deps.onNetworkResult?.(false);
    return new Response('offline', {
      status: 503,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }
}

export interface WarmDeps {
  openCache: () => Promise<Cache>;
  fetchFn: (request: Request) => Promise<Response>;
  origin: string;
  concurrency?: number;
}

export interface WarmResult {
  /** Neu abgelegt. */
  cached: number;
  /** Schon im Cache dieses Builds, nicht erneut abgerufen. */
  present: number;
  /** Netzfehler, Zeitüberschreitung oder 5xx — ein neuer Versuch lohnt. */
  failed: string[];
  /** Antwort ohne Seite (Umleitung, 4xx) — ein neuer Versuch ändert nichts. */
  rejected: string[];
}

/**
 * Ruft die Seiten ab und legt sie in die App-Shell, höchstens
 * `WARM_CONCURRENCY` gleichzeitig, damit das Vorwärmen der offenen Seite die
 * Leitung nicht nimmt. Seiten, die der Cache dieses Builds schon hält, werden
 * übersprungen: Die Seite bittet bei jedem Start erneut, und ein
 * abgebrochener Lauf setzt dort fort, wo er stand. Aktuell hält sie ohnehin
 * jede Navigation, die online eine Seite holt. Fremde Adressen werden
 * übergangen.
 */
export async function warmAppShell(
  urls: string[],
  deps: WarmDeps,
): Promise<WarmResult> {
  const cache = await deps.openCache();
  const seen = new Set<string>();
  const queue: { raw: string; url: URL }[] = [];
  for (const raw of urls) {
    let url: URL;
    try {
      url = new URL(raw, deps.origin);
    } catch {
      continue;
    }
    if (url.origin !== deps.origin || seen.has(url.href)) continue;
    seen.add(url.href);
    queue.push({ raw, url });
  }

  // Ergebnisse je Position, damit die Listen der Reihenfolge der Eingabe
  // folgen, egal welcher Abruf zuerst fertig wird.
  const outcomes: ('cached' | 'present' | 'failed' | 'rejected')[] = [];
  let next = 0;
  const work = async () => {
    while (next < queue.length) {
      const index = next++;
      const { url } = queue[index];
      outcomes[index] = await warmOne(url, cache, deps);
    }
  };
  const workers = Math.max(1, deps.concurrency ?? WARM_CONCURRENCY);
  await Promise.all(Array.from({ length: Math.min(workers, queue.length) }, work));

  const result: WarmResult = { cached: 0, present: 0, failed: [], rejected: [] };
  queue.forEach(({ raw }, index) => {
    const outcome = outcomes[index];
    if (outcome === 'cached') result.cached++;
    else if (outcome === 'present') result.present++;
    else result[outcome].push(raw);
  });
  await trimCache(cache, APP_SHELL_MAX_ENTRIES);
  return result;
}

async function warmOne(
  url: URL,
  cache: Cache,
  deps: WarmDeps,
): Promise<'cached' | 'present' | 'failed' | 'rejected'> {
  try {
    if (await cache.match(url.href, { ignoreVary: true })) return 'present';
    const res = await withTimeout(
      deps.fetchFn(
        new Request(url.href, {
          credentials: 'same-origin',
          headers: { Accept: 'text/html' },
        }),
      ),
      WARM_TIMEOUT_MS,
      `warm ${url.pathname}`,
    );
    if (res.status >= 500) return 'failed';
    if (!isCacheableShellResponse(res)) return 'rejected';
    await cache.put(url.href, res);
    return 'cached';
  } catch {
    return 'failed';
  }
}

export async function cleanupOldAppShellCaches(
  current: string,
  cacheStorage: Pick<CacheStorage, 'keys' | 'delete'>,
): Promise<void> {
  const names = await cacheStorage.keys();
  const legacy: readonly string[] = LEGACY_RSC_CACHES;
  await Promise.all(
    names
      .filter(
        (name) =>
          (name.startsWith(APP_SHELL_CACHE_PREFIX) && name !== current) ||
          legacy.includes(name),
      )
      .map((name) => cacheStorage.delete(name)),
  );
}
