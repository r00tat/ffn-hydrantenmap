// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const remove = vi.fn().mockResolvedValue(undefined);
const mockAddListener = vi.fn();

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
  },
  registerPlugin: () => ({
    addListener: mockAddListener,
  }),
}));

/** Fires the most recently registered `stopRequested` listener. */
function fireStopRequested() {
  const call = mockAddListener.mock.calls.at(-1);
  const handler = call?.[1] as (() => void) | undefined;
  handler?.();
}

describe('useNotificationStopListener', () => {
  beforeEach(() => {
    remove.mockClear();
    mockAddListener.mockReset();
    mockAddListener.mockResolvedValue({ remove });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('subscribes to the native stopRequested event on mount', async () => {
    const { useNotificationStopListener } = await import(
      './useNotificationStopListener'
    );
    renderHook(() => useNotificationStopListener(vi.fn()));
    await Promise.resolve();

    expect(mockAddListener).toHaveBeenCalledWith(
      'stopRequested',
      expect.any(Function),
    );
  });

  it('invokes the handler when the native event fires', async () => {
    const { useNotificationStopListener } = await import(
      './useNotificationStopListener'
    );
    const onStop = vi.fn();
    renderHook(() => useNotificationStopListener(onStop));
    await Promise.resolve();

    fireStopRequested();

    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('invokes the latest handler without resubscribing on rerender', async () => {
    const { useNotificationStopListener } = await import(
      './useNotificationStopListener'
    );
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ cb }) => useNotificationStopListener(cb),
      { initialProps: { cb: first } },
    );
    await Promise.resolve();

    rerender({ cb: second });
    fireStopRequested();

    expect(mockAddListener).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('removes the listener on unmount', async () => {
    const { useNotificationStopListener } = await import(
      './useNotificationStopListener'
    );
    const { unmount } = renderHook(() =>
      useNotificationStopListener(vi.fn()),
    );
    await Promise.resolve();

    unmount();
    await Promise.resolve();

    expect(remove).toHaveBeenCalledTimes(1);
  });
});
