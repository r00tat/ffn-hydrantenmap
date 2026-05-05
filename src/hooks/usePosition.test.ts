// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const mockShowSnackbar = vi.fn();

vi.mock('../components/providers/SnackbarProvider', () => ({
  useSnackbar: () => mockShowSnackbar,
}));

vi.mock('../lib/permissions', () => ({
  ensureLocation: vi.fn(() => Promise.resolve(true)),
}));

import usePosition from './usePosition';

type WatchCb = (pos: GeolocationPosition) => void;
type ErrCb = (err: GeolocationPositionError) => void;

describe('usePosition', () => {
  let successCb: WatchCb | undefined;
  let errorCb: ErrCb | undefined;
  let clearWatch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    successCb = undefined;
    errorCb = undefined;
    mockShowSnackbar.mockClear();
    clearWatch = vi.fn();

    Object.defineProperty(navigator, 'geolocation', {
      value: {
        watchPosition: vi.fn((ok: WatchCb, err: ErrCb) => {
          successCb = ok;
          errorCb = err;
          return 42;
        }),
        clearWatch,
      },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('isPending is false before enableTracking', () => {
    const { result } = renderHook(() => usePosition());
    const [, , , , isPending] = result.current;
    expect(isPending).toBe(false);
  });

  it('isPending is true after enableTracking, false after first fix', async () => {
    const { result } = renderHook(() => usePosition());

    await act(async () => {
      result.current[3]();
    });
    expect(result.current[4]).toBe(true);

    act(() => {
      successCb?.({
        coords: {
          latitude: 47.9,
          longitude: 16.8,
          altitude: 120,
          accuracy: 8,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      } as GeolocationPosition);
    });
    expect(result.current[4]).toBe(false);
    expect(result.current[1]).toBe(true);
  });

  it('isPending is false after error', async () => {
    const { result } = renderHook(() => usePosition());

    await act(async () => {
      result.current[3]();
    });
    expect(result.current[4]).toBe(true);

    act(() => {
      errorCb?.({
        code: 3,
        message: 'timeout',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as GeolocationPositionError);
    });
    expect(result.current[4]).toBe(false);
    expect(mockShowSnackbar).toHaveBeenCalled();
  });

  it('exposes GeolocationPosition including accuracy via third tuple slot', async () => {
    const { result } = renderHook(() => usePosition());
    await act(async () => {
      result.current[3]();
    });
    act(() => {
      successCb?.({
        coords: {
          latitude: 47.9,
          longitude: 16.8,
          altitude: 120,
          accuracy: 12.5,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      } as GeolocationPosition);
    });
    expect(result.current[2]?.coords.accuracy).toBe(12.5);
  });
});
