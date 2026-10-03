// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  login: { isAuthorized: true, hasFirebaseUser: true },
  connectivity: { reachable: true, status: 'online' as string },
  firecallId: 'AAAAAAAAAAAAAAAAAAAA' as string | undefined,
  request: vi.fn(),
}));

vi.mock('./useFirebaseLogin', () => ({ default: () => mocks.login }));
vi.mock('./useConnectivity', () => ({ default: () => mocks.connectivity }));
vi.mock('./useFirecall', () => ({
  useFirecall: () => ({ id: mocks.firecallId ?? 'unknown', name: '' }),
}));
vi.mock('../lib/appShellWarmup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/appShellWarmup')>()),
  requestAppShellWarmup: (urls: string[]) => mocks.request(urls),
}));

import useAppShellWarmup, {
  APP_SHELL_WARMUP_DELAY_MS,
  APP_SHELL_WARMUP_MAX_RETRIES,
  APP_SHELL_WARMUP_RETRY_MS,
  resetAppShellWarmupForTests,
} from './useAppShellWarmup';

const done = { cached: 3, present: 0, failed: [], rejected: [] };

/**
 * Spult die Zeit in Schritten vor. React wendet eine Zustandsänderung aus
 * einem Timer erst am Ende von `act` an; erst danach steht der nächste Timer.
 */
async function advanceInSteps(totalMs: number, stepMs = APP_SHELL_WARMUP_DELAY_MS) {
  for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(stepMs);
    });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  resetAppShellWarmupForTests();
  mocks.login = { isAuthorized: true, hasFirebaseUser: true };
  mocks.connectivity = { reachable: true, status: 'online' };
  mocks.firecallId = 'AAAAAAAAAAAAAAAAAAAA';
  mocks.request.mockReset();
  mocks.request.mockResolvedValue(done);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAppShellWarmup', () => {
  it('wärmt nach der Anmeldung die Seiten des aktuellen Einsatzes vor', async () => {
    renderHook(() => useAppShellWarmup());
    expect(mocks.request).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(APP_SHELL_WARMUP_DELAY_MS);
    });
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.request.mock.calls[0][0]).toContain(
      '/einsatz/AAAAAAAAAAAAAAAAAAAA/tagebuch',
    );
  });

  it('wärmt je Einsatz nur einmal vor', async () => {
    const { rerender } = renderHook(() => useAppShellWarmup());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(APP_SHELL_WARMUP_DELAY_MS);
    });
    rerender();
    renderHook(() => useAppShellWarmup());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(APP_SHELL_WARMUP_DELAY_MS);
    });
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it('startet die Wartezeit nicht neu, wenn nur Schreibvorgänge kommen und gehen', async () => {
    const { rerender } = renderHook(() => useAppShellWarmup());
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(APP_SHELL_WARMUP_DELAY_MS / 2);
      });
      mocks.connectivity = {
        reachable: true,
        status: i % 2 === 0 ? 'syncing' : 'online',
      };
      rerender();
    }
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it('wärmt offline nicht vor', async () => {
    mocks.connectivity = { reachable: false, status: 'offline' };
    renderHook(() => useAppShellWarmup());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(APP_SHELL_WARMUP_DELAY_MS * 2);
    });
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('wärmt ohne Anmeldung nicht vor', async () => {
    mocks.login = { isAuthorized: false, hasFirebaseUser: true };
    renderHook(() => useAppShellWarmup());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(APP_SHELL_WARMUP_DELAY_MS * 2);
    });
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('versucht gescheiterte Seiten nach einer Pause erneut', async () => {
    // Beim Offline-Test fehlte die Atemschutzüberwachung: Ein einzelner
    // gescheiterter Abruf blieb bis zum nächsten Neuladen aus.
    mocks.request.mockResolvedValueOnce({
      cached: 20,
      present: 0,
      failed: ['/einsatz/AAAAAAAAAAAAAAAAAAAA/atemschutzueberwachung'],
      rejected: [],
    });
    renderHook(() => useAppShellWarmup());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(APP_SHELL_WARMUP_DELAY_MS);
    });
    expect(mocks.request).toHaveBeenCalledTimes(1);
    await advanceInSteps(APP_SHELL_WARMUP_RETRY_MS + APP_SHELL_WARMUP_DELAY_MS);
    expect(mocks.request).toHaveBeenCalledTimes(2);
    // Danach ist alles da, es wird nicht weiter gefragt.
    await advanceInSteps(APP_SHELL_WARMUP_RETRY_MS * 10);
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });

  it('gibt nach einigen Versuchen auf', async () => {
    mocks.request.mockResolvedValue({ cached: 0, present: 0, failed: ['/x'], rejected: [] });
    renderHook(() => useAppShellWarmup());
    await advanceInSteps(APP_SHELL_WARMUP_RETRY_MS * 2 ** (APP_SHELL_WARMUP_MAX_RETRIES + 2));
    expect(mocks.request).toHaveBeenCalledTimes(APP_SHELL_WARMUP_MAX_RETRIES + 1);
  });

  it('wiederholt keine Seiten, die keine Seite liefern (Umleitung, 404)', async () => {
    mocks.request.mockResolvedValue({ cached: 10, present: 0, failed: [], rejected: ['/admin'] });
    renderHook(() => useAppShellWarmup());
    await advanceInSteps(APP_SHELL_WARMUP_RETRY_MS * 10);
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it('holt nach dem Reconnect nach, was offline gescheitert ist', async () => {
    mocks.request.mockResolvedValueOnce({ cached: 0, present: 0, failed: ['/x'], rejected: [] });
    const { rerender } = renderHook(() => useAppShellWarmup());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(APP_SHELL_WARMUP_DELAY_MS);
    });
    mocks.connectivity = { reachable: false, status: 'offline' };
    rerender();
    mocks.connectivity = { reachable: true, status: 'online' };
    rerender();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(APP_SHELL_WARMUP_DELAY_MS);
    });
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });

  it('versucht es erneut, wenn kein Service Worker geantwortet hat', async () => {
    mocks.request.mockResolvedValueOnce(null);
    const { rerender } = renderHook(() => useAppShellWarmup());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(APP_SHELL_WARMUP_DELAY_MS);
    });
    mocks.firecallId = 'BBBBBBBBBBBBBBBBBBBB';
    rerender();
    mocks.firecallId = 'AAAAAAAAAAAAAAAAAAAA';
    rerender();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(APP_SHELL_WARMUP_DELAY_MS);
    });
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });
});
