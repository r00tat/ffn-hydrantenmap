'use client';

import { OFFLINE_TILE_CACHE } from '../common/offlineTiles';

/**
 * Lädt Kartenkacheln in den eigenen Cache `offline-tiles`.
 *
 * Die **Seite** schreibt, nicht der Service Worker: So ist der Fortschritt
 * direkt sichtbar, ein Abbruch wirkt sofort, und es gibt keine Nachrichten
 * zwischen Seite und Worker. Der Worker liest den Cache nur
 * (`src/worker/patterns.ts`).
 *
 * Abgefragt wird mit `mode: 'cors'` — basemap.at sendet
 * `Access-Control-Allow-Origin: *`. Nur so ist die Antwort lesbar und ihre
 * Größe bekannt; eine opake Antwort belegte im Kontingent ein Vielfaches.
 */

export interface OfflineTileProgress {
  total: number;
  done: number;
  loaded: number;
  failed: number;
  /** Lagen schon im Cache. */
  skipped: number;
  /** Bytes der neu geladenen Kacheln. */
  bytes: number;
  aborted: boolean;
}

/** Speicherkontingent erschöpft — der Kachel-Cache wurde geleert. */
export class OfflineTilesQuotaError extends Error {
  constructor() {
    super('Speicherkontingent für Offline-Kacheln erschöpft');
    this.name = 'OfflineTilesQuotaError';
  }
}

function isQuotaError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  );
}

function defaultCacheStorage(): CacheStorage | undefined {
  return typeof caches === 'undefined' ? undefined : caches;
}

export interface DownloadOptions {
  signal?: AbortSignal;
  onProgress?: (progress: OfflineTileProgress) => void;
  /** Gleichzeitige Abrufe. Klein gehalten, aus Rücksicht auf den Anbieter. */
  concurrency?: number;
  cacheStorage?: CacheStorage;
  fetchFn?: (url: string, init: RequestInit) => Promise<Response>;
}

export async function downloadOfflineTiles(
  urls: string[],
  options: DownloadOptions = {},
): Promise<OfflineTileProgress> {
  const {
    signal,
    onProgress,
    concurrency = 4,
    cacheStorage = defaultCacheStorage(),
    fetchFn = (url, init) => fetch(url, init),
  } = options;
  if (!cacheStorage) throw new Error('Cache API nicht verfügbar');

  const cache = await cacheStorage.open(OFFLINE_TILE_CACHE);
  const progress: OfflineTileProgress = {
    total: urls.length,
    done: 0,
    loaded: 0,
    failed: 0,
    skipped: 0,
    bytes: 0,
    aborted: false,
  };
  let quotaHit = false;
  let next = 0;

  const report = () => onProgress?.({ ...progress });

  const worker = async () => {
    while (next < urls.length && !quotaHit) {
      if (signal?.aborted) {
        progress.aborted = true;
        return;
      }
      const url = urls[next++];
      try {
        if (await cache.match(url)) {
          progress.skipped++;
        } else {
          const response = await fetchFn(url, {
            mode: 'cors',
            credentials: 'omit',
            signal,
          });
          if (!response.ok) {
            progress.failed++;
          } else {
            const blob = await response.clone().blob();
            await cache.put(url, response);
            progress.loaded++;
            progress.bytes += blob.size;
          }
        }
      } catch (error) {
        if (isQuotaError(error)) {
          quotaHit = true;
          return;
        }
        if (signal?.aborted) {
          progress.aborted = true;
          return;
        }
        progress.failed++;
      }
      progress.done++;
      report();
    }
  };

  await Promise.all(
    Array.from({ length: Math.max(1, concurrency) }, () => worker()),
  );

  if (quotaHit) {
    // Wie `purgeOnQuotaError` im Service Worker: lieber den Kachelvorrat
    // opfern als Firestore-Cache, App-Shell und Warteschlangen, die im selben
    // Kontingent liegen.
    await cacheStorage.delete(OFFLINE_TILE_CACHE);
    throw new OfflineTilesQuotaError();
  }
  if (signal?.aborted) progress.aborted = true;
  report();
  return progress;
}

/** Anzahl der vorgeladenen Kacheln. */
export async function countOfflineTiles(
  cacheStorage: CacheStorage | undefined = defaultCacheStorage(),
): Promise<number> {
  if (!cacheStorage) return 0;
  try {
    const cache = await cacheStorage.open(OFFLINE_TILE_CACHE);
    return (await cache.keys()).length;
  } catch {
    return 0;
  }
}

export async function clearOfflineTiles(
  cacheStorage: CacheStorage | undefined = defaultCacheStorage(),
): Promise<void> {
  await cacheStorage?.delete(OFFLINE_TILE_CACHE);
}
