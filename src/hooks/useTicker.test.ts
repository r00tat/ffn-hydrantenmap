// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useTicker from './useTicker';

describe('useTicker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('startet mit der aktuellen Zeit', () => {
    const { result } = renderHook(() => useTicker(1000));
    expect(result.current.toISOString()).toBe('2026-09-02T10:00:00.000Z');
  });

  it('schreibt die Uhr im Takt fort', () => {
    const { result } = renderHook(() => useTicker(1000));
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(result.current.toISOString()).toBe('2026-09-02T10:00:02.000Z');
  });

  it('räumt den Timer beim Abbau auf', () => {
    const clear = vi.spyOn(globalThis, 'clearInterval');
    const { unmount } = renderHook(() => useTicker(1000));
    unmount();
    expect(clear).toHaveBeenCalled();
  });
});
