// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useWakeLock from './useWakeLock';

class FakeSentinel extends EventTarget {
  released = false;
  release = vi.fn(async () => {
    this.released = true;
    this.dispatchEvent(new Event('release'));
  });
}

let sentinels: FakeSentinel[] = [];
const request = vi.fn(async () => {
  const s = new FakeSentinel();
  sentinels.push(s);
  return s;
});

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
}

describe('useWakeLock', () => {
  beforeEach(() => {
    sentinels = [];
    request.mockClear();
    setVisibility('visible');
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request },
    });
  });

  afterEach(() => {
    // @ts-expect-error -- Testaufbau entfernen
    delete navigator.wakeLock;
  });

  it('fordert die Sperre an, solange aktiv, und gibt sie wieder frei', async () => {
    const { result, rerender } = renderHook(({ on }) => useWakeLock(on), {
      initialProps: { on: true },
    });
    await waitFor(() => expect(result.current).toBe(true));
    expect(request).toHaveBeenCalledWith('screen');

    rerender({ on: false });
    expect(sentinels[0].release).toHaveBeenCalled();
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('fordert nach dem Zurückkehren auf die Seite erneut an', async () => {
    const { result } = renderHook(() => useWakeLock(true));
    await waitFor(() => expect(result.current).toBe(true));

    // Der Browser gibt die Sperre beim Verbergen selbst frei.
    setVisibility('hidden');
    await act(async () => {
      await sentinels[0].release();
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);

    setVisibility('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(result.current).toBe(true));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('fordert nichts an, wenn inaktiv', () => {
    renderHook(() => useWakeLock(false));
    expect(request).not.toHaveBeenCalled();
  });

  it('kommt ohne Wake Lock API aus', () => {
    // @ts-expect-error -- Testaufbau entfernen
    delete navigator.wakeLock;
    const { result } = renderHook(() => useWakeLock(true));
    expect(result.current).toBe(false);
  });

  it('übersteht eine abgelehnte Anforderung', async () => {
    request.mockRejectedValueOnce(new Error('NotAllowedError'));
    const { result } = renderHook(() => useWakeLock(true));
    await act(async () => {});
    expect(result.current).toBe(false);
  });
});
