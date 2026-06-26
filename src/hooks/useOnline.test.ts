// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

function setNavigatorOnLine(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value,
  });
}

import useOnline from './useOnline';

describe('useOnline', () => {
  beforeEach(() => {
    setNavigatorOnLine(true);
  });

  afterEach(() => {
    setNavigatorOnLine(true);
  });

  it('returns the initial navigator.onLine value on mount', () => {
    setNavigatorOnLine(false);
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(false);
  });

  it('reports true while online', () => {
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);
  });

  it('switches to false when the window goes offline', () => {
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);

    act(() => {
      setNavigatorOnLine(false);
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current).toBe(false);
  });

  it('switches back to true when the window comes online again', () => {
    const { result } = renderHook(() => useOnline());

    act(() => {
      setNavigatorOnLine(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);

    act(() => {
      setNavigatorOnLine(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(true);
  });

  it('removes its event listeners on unmount', () => {
    const { result, unmount } = renderHook(() => useOnline());
    unmount();

    act(() => {
      setNavigatorOnLine(false);
      window.dispatchEvent(new Event('offline'));
    });

    // After unmount the state must not update anymore.
    expect(result.current).toBe(true);
  });
});
