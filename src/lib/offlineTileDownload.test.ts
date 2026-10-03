import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OFFLINE_TILE_CACHE } from '../common/offlineTiles';
import {
  clearOfflineTiles,
  countOfflineTiles,
  downloadOfflineTiles,
  OfflineTilesQuotaError,
} from './offlineTileDownload';

function fakeCacheStorage() {
  const store = new Map<string, Response>();
  const cache = {
    match: vi.fn(async (url: string) => store.get(url)),
    put: vi.fn(async (url: string, response: Response) => {
      store.set(url, response);
    }),
    keys: vi.fn(async () => [...store.keys()].map((u) => ({ url: u }))),
  };
  const storage = {
    open: vi.fn(async () => cache),
    delete: vi.fn(async () => {
      store.clear();
      return true;
    }),
  };
  return { store, cache, storage: storage as unknown as CacheStorage };
}

const okResponse = (size: number) =>
  new Response(new Uint8Array(size), { status: 200 });

describe('downloadOfflineTiles', () => {
  let fake: ReturnType<typeof fakeCacheStorage>;

  beforeEach(() => {
    fake = fakeCacheStorage();
  });

  it('lädt jede Kachel in den eigenen Cache und zählt die Größe', async () => {
    const fetchFn = vi.fn(async () => okResponse(100));
    const progress = vi.fn();
    const result = await downloadOfflineTiles(['a', 'b', 'c'], {
      cacheStorage: fake.storage,
      fetchFn,
      onProgress: progress,
    });
    expect(fake.storage.open).toHaveBeenCalledWith(OFFLINE_TILE_CACHE);
    expect(result).toMatchObject({
      total: 3,
      done: 3,
      loaded: 3,
      failed: 0,
      skipped: 0,
      bytes: 300,
      aborted: false,
    });
    expect(fetchFn).toHaveBeenCalledWith('a', expect.objectContaining({ mode: 'cors' }));
    expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ done: 3 }));
    expect([...fake.store.keys()].sort()).toEqual(['a', 'b', 'c']);
  });

  it('überspringt Kacheln, die schon im Cache liegen', async () => {
    fake.store.set('a', okResponse(10));
    const fetchFn = vi.fn(async () => okResponse(100));
    const result = await downloadOfflineTiles(['a', 'b'], {
      cacheStorage: fake.storage,
      fetchFn,
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result.skipped).toBe(1);
    expect(result.loaded).toBe(1);
  });

  it('zählt Fehlantworten als gescheitert und legt sie nicht ab', async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url === 'b' ? new Response('', { status: 404 }) : okResponse(5),
    );
    const result = await downloadOfflineTiles(['a', 'b'], {
      cacheStorage: fake.storage,
      fetchFn,
    });
    expect(result.failed).toBe(1);
    expect(fake.store.has('b')).toBe(false);
  });

  it('bricht ab, sobald das Signal kommt', async () => {
    const controller = new AbortController();
    const fetchFn = vi.fn(async () => {
      controller.abort();
      return okResponse(1);
    });
    const urls = Array.from({ length: 50 }, (_, i) => `u${i}`);
    const result = await downloadOfflineTiles(urls, {
      cacheStorage: fake.storage,
      fetchFn,
      signal: controller.signal,
      concurrency: 1,
    });
    expect(result.aborted).toBe(true);
    expect(result.done).toBeLessThan(50);
  });

  it('leert den Cache, wenn das Kontingent erschöpft ist', async () => {
    fake.cache.put.mockRejectedValueOnce(
      Object.assign(new Error('full'), { name: 'QuotaExceededError' }),
    );
    await expect(
      downloadOfflineTiles(['a'], {
        cacheStorage: fake.storage,
        fetchFn: async () => okResponse(1),
      }),
    ).rejects.toBeInstanceOf(OfflineTilesQuotaError);
    expect(fake.storage.delete).toHaveBeenCalledWith(OFFLINE_TILE_CACHE);
  });
});

describe('countOfflineTiles / clearOfflineTiles', () => {
  it('zählt und löscht den Kachel-Cache', async () => {
    const fake = fakeCacheStorage();
    fake.store.set('a', okResponse(1));
    expect(await countOfflineTiles(fake.storage)).toBe(1);
    await clearOfflineTiles(fake.storage);
    expect(fake.storage.delete).toHaveBeenCalledWith(OFFLINE_TILE_CACHE);
  });

  it('liefert 0 ohne Cache-API', async () => {
    expect(await countOfflineTiles(undefined)).toBe(0);
  });
});
