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
 * dieses Modul.
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
/** Zeitgrenze je Seite beim Vorwärmen. */
export const WARM_TIMEOUT_MS = 15_000;
export const APP_SHELL_MAX_ENTRIES = 80;

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

export function isAppShellNavigation({
  request,
  url,
  sameOrigin,
}: {
  request: Request;
  url: URL;
  sameOrigin: boolean;
}): boolean {
  return (
    sameOrigin &&
    request.mode === 'navigate' &&
    request.method === 'GET' &&
    !EXCLUDED_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
  );
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

async function trimCache(cache: Cache, maxEntries: number): Promise<void> {
  const keys = await cache.keys();
  const excess = keys.length - maxEntries;
  for (let i = 0; i < excess; i++) {
    await cache.delete(keys[i]);
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

export interface NavigationDeps {
  openCache: () => Promise<Cache>;
  fetchFn: (request: Request) => Promise<Response>;
  /** Suche über alle Caches (Seiten aus Besuchen vor dieser Version). */
  matchAnyCache: (request: Request) => Promise<Response | undefined>;
  timeoutMs?: number;
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
  const found =
    (c && (await c.match(key, { ignoreVary: true }))) ||
    (await deps.matchAnyCache(request).catch(() => undefined)) ||
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

export interface WarmDeps {
  openCache: () => Promise<Cache>;
  fetchFn: (request: Request) => Promise<Response>;
  origin: string;
}

export interface WarmResult {
  cached: number;
  failed: string[];
}

/**
 * Ruft die Seiten der Reihe nach ab und legt sie in die App-Shell. Der Reihe
 * nach, damit das Vorwärmen nicht mit der Seite um die Leitung konkurriert.
 * Fremde Adressen werden übergangen.
 */
export async function warmAppShell(
  urls: string[],
  deps: WarmDeps,
): Promise<WarmResult> {
  const cache = await deps.openCache();
  const seen = new Set<string>();
  const result: WarmResult = { cached: 0, failed: [] };

  for (const raw of urls) {
    let url: URL;
    try {
      url = new URL(raw, deps.origin);
    } catch {
      continue;
    }
    if (url.origin !== deps.origin || seen.has(url.href)) continue;
    seen.add(url.href);
    try {
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
      if (!isCacheableShellResponse(res)) {
        result.failed.push(raw);
        continue;
      }
      await cache.put(url.href, res);
      result.cached++;
    } catch {
      result.failed.push(raw);
    }
  }
  await trimCache(cache, APP_SHELL_MAX_ENTRIES);
  return result;
}

export async function cleanupOldAppShellCaches(
  current: string,
  cacheStorage: Pick<CacheStorage, 'keys' | 'delete'>,
): Promise<void> {
  const names = await cacheStorage.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith(APP_SHELL_CACHE_PREFIX) && name !== current)
      .map((name) => cacheStorage.delete(name)),
  );
}
