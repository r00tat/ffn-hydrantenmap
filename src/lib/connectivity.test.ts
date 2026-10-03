// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ConnectivityModule = typeof import('./connectivity');
type PendingWritesModule = typeof import('./pendingWrites');

let connectivity: ConnectivityModule;
let pendingWrites: PendingWritesModule;
let fetchMock: ReturnType<typeof vi.fn>;
let stop: (() => void) | undefined;

function setNavigatorOnLine(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value,
  });
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: state,
  });
}

const reachableResponse = () => new Response(null, { status: 204 });

/** Lets pending promise callbacks (fetch → state update) run. */
async function flush() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  setNavigatorOnLine(true);
  setVisibility('visible');
  fetchMock = vi.fn(async () => reachableResponse());
  vi.stubGlobal('fetch', fetchMock);
  pendingWrites = await import('./pendingWrites');
  connectivity = await import('./connectivity');
});

afterEach(() => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setNavigatorOnLine(true);
  setVisibility('visible');
});

describe('connectivity', () => {
  it('geht vor der ersten Prüfung von navigator.onLine aus', () => {
    expect(connectivity.getConnectivityStatus()).toBe('online');
    expect(connectivity.isOffline()).toBe(false);
    expect(connectivity.getConnectivityState().lastCheck).toBeNull();
  });

  it('pingt /api/ping ohne Cache', async () => {
    await connectivity.checkConnectivityNow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/ping');
    expect(init).toMatchObject({ method: 'HEAD', cache: 'no-store' });
    expect(connectivity.getConnectivityState().lastCheck).not.toBeNull();
  });

  it('meldet offline, wenn der Ping scheitert (WLAN ohne Internet)', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(connectivity.checkConnectivityNow()).resolves.toBe(false);
    expect(connectivity.getConnectivityStatus()).toBe('offline');
    expect(connectivity.isOffline()).toBe(true);
  });

  it('meldet offline, wenn statt 204 etwas anderes kommt (Captive Portal)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<html>Login</html>', { status: 200 }),
    );
    await expect(connectivity.checkConnectivityNow()).resolves.toBe(false);
    expect(connectivity.getConnectivityStatus()).toBe('offline');
  });

  it('bricht den Ping nach 5 s ab und meldet offline', async () => {
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const result = connectivity.checkConnectivityNow();
    await vi.advanceTimersByTimeAsync(connectivity.PING_TIMEOUT_MS);
    await expect(result).resolves.toBe(false);
    expect(connectivity.getConnectivityStatus()).toBe('offline');
  });

  it('pingt nicht, wenn navigator.onLine false ist', async () => {
    setNavigatorOnLine(false);
    await expect(connectivity.checkConnectivityNow()).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(connectivity.isOffline()).toBe(true);
  });

  it('fasst gleichzeitige Prüfungen zu einem Ping zusammen', async () => {
    await Promise.all([
      connectivity.checkConnectivityNow(),
      connectivity.checkConnectivityNow(),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('meldet syncing, solange erreichbar und Schreibvorgänge offen sind', async () => {
    let resolveWrite!: () => void;
    pendingWrites.trackPendingWrite(
      new Promise<void>((resolve) => {
        resolveWrite = resolve;
      }),
    );
    expect(connectivity.getConnectivityStatus()).toBe('syncing');
    expect(connectivity.getConnectivityState().pendingWrites).toBe(1);

    resolveWrite();
    await flush();
    expect(connectivity.getConnectivityStatus()).toBe('online');
  });

  it('bleibt offline, auch wenn Schreibvorgänge offen sind', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await connectivity.checkConnectivityNow();
    pendingWrites.trackPendingWrite(new Promise<void>(() => {}));
    expect(connectivity.getConnectivityStatus()).toBe('offline');
    expect(connectivity.getConnectivityState().pendingWrites).toBe(1);
  });

  it('benachrichtigt Abonnenten nur bei Änderungen und liefert stabile Snapshots', async () => {
    const listener = vi.fn();
    const unsubscribe = connectivity.subscribeConnectivity(listener);
    const before = connectivity.getConnectivityState();
    expect(connectivity.getConnectivityState()).toBe(before);

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await connectivity.checkConnectivityNow();
    expect(listener).toHaveBeenCalled();
    expect(connectivity.getConnectivityState()).not.toBe(before);

    unsubscribe();
    listener.mockClear();
    await connectivity.checkConnectivityNow();
    expect(listener).not.toHaveBeenCalled();
  });

  describe('onReconnect', () => {
    it('feuert beim Wechsel offline → online, nicht bei online → online', async () => {
      const callback = vi.fn();
      connectivity.onReconnect(callback);

      await connectivity.checkConnectivityNow();
      expect(callback).not.toHaveBeenCalled();

      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await connectivity.checkConnectivityNow();
      expect(callback).not.toHaveBeenCalled();

      await connectivity.checkConnectivityNow();
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('lässt sich wieder abmelden', async () => {
      const callback = vi.fn();
      const off = connectivity.onReconnect(callback);
      off();
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await connectivity.checkConnectivityNow();
      await connectivity.checkConnectivityNow();
      expect(callback).not.toHaveBeenCalled();
    });

    it('ein werfender Callback hält die anderen nicht auf', async () => {
      const failing = vi.fn(() => {
        throw new Error('boom');
      });
      const ok = vi.fn();
      connectivity.onReconnect(failing);
      connectivity.onReconnect(ok);
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await connectivity.checkConnectivityNow();
      await connectivity.checkConnectivityNow();
      expect(ok).toHaveBeenCalledTimes(1);
    });
  });

  describe('startConnectivityMonitor', () => {
    it('prüft sofort beim Start', async () => {
      stop = connectivity.startConnectivityMonitor();
      await flush();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('pingt online alle 30 s und offline öfter', async () => {
      stop = connectivity.startConnectivityMonitor();
      await flush();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(connectivity.ONLINE_INTERVAL_MS - 1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
      await vi.advanceTimersByTimeAsync(connectivity.ONLINE_INTERVAL_MS);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(connectivity.isOffline()).toBe(true);

      await vi.advanceTimersByTimeAsync(connectivity.OFFLINE_INTERVAL_MS);
      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(connectivity.OFFLINE_INTERVAL_MS).toBeLessThan(
        connectivity.ONLINE_INTERVAL_MS,
      );
    });

    it('meldet beim offline-Event sofort offline', async () => {
      stop = connectivity.startConnectivityMonitor();
      await flush();
      setNavigatorOnLine(false);
      window.dispatchEvent(new Event('offline'));
      expect(connectivity.isOffline()).toBe(true);
    });

    it('prüft beim online-Event sofort', async () => {
      stop = connectivity.startConnectivityMonitor();
      await flush();
      fetchMock.mockClear();
      window.dispatchEvent(new Event('online'));
      await flush();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('prüft bei Fokus und wenn die Seite wieder sichtbar wird', async () => {
      stop = connectivity.startConnectivityMonitor();
      await flush();
      fetchMock.mockClear();

      window.dispatchEvent(new Event('focus'));
      await flush();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      setVisibility('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      await flush();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('pingt nicht im Hintergrund', async () => {
      stop = connectivity.startConnectivityMonitor();
      await flush();
      fetchMock.mockClear();
      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(connectivity.ONLINE_INTERVAL_MS * 3);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('ist beim zweiten Start ein No-op und hört erst beim letzten Stopp auf', async () => {
      const stopA = connectivity.startConnectivityMonitor();
      const stopB = connectivity.startConnectivityMonitor();
      await flush();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      stopA();
      await vi.advanceTimersByTimeAsync(connectivity.ONLINE_INTERVAL_MS);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      stopB();
      fetchMock.mockClear();
      await vi.advanceTimersByTimeAsync(connectivity.ONLINE_INTERVAL_MS * 2);
      window.dispatchEvent(new Event('focus'));
      await flush();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
