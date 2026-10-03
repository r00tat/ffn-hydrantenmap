// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  login: { isAuthorized: true, hasFirebaseUser: true },
  connectivity: { status: 'online' as string },
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
  resetAppShellWarmupForTests,
} from './useAppShellWarmup';

beforeEach(() => {
  vi.useFakeTimers();
  resetAppShellWarmupForTests();
  mocks.login = { isAuthorized: true, hasFirebaseUser: true };
  mocks.connectivity = { status: 'online' };
  mocks.firecallId = 'AAAAAAAAAAAAAAAAAAAA';
  mocks.request.mockReset();
  mocks.request.mockResolvedValue({ cached: 3, failed: [] });
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

  it('wärmt offline nicht vor', async () => {
    mocks.connectivity = { status: 'offline' };
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
