// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePullToRefresh } from './usePullToRefresh';

function fireTouch(type: string, y: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    touches: [{ clientY: y }],
    changedTouches: [{ clientY: y }],
  });
  document.dispatchEvent(event);
}

describe('usePullToRefresh', () => {
  it('ruft onRefresh, wenn Pull-Distanz > Schwelle', () => {
    const onRefresh = vi.fn();
    renderHook(() =>
      usePullToRefresh({ onRefresh, threshold: 80, enabled: true }),
    );
    Object.defineProperty(document.documentElement, 'scrollTop', {
      value: 0,
      configurable: true,
    });

    act(() => {
      fireTouch('touchstart', 100);
      fireTouch('touchmove', 220); // +120 px overscroll
      fireTouch('touchend', 220);
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('ruft onRefresh NICHT, wenn Distanz < Schwelle', () => {
    const onRefresh = vi.fn();
    renderHook(() =>
      usePullToRefresh({ onRefresh, threshold: 80, enabled: true }),
    );
    act(() => {
      fireTouch('touchstart', 100);
      fireTouch('touchmove', 140);
      fireTouch('touchend', 140);
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('ruft onRefresh NICHT, wenn enabled=false', () => {
    const onRefresh = vi.fn();
    renderHook(() =>
      usePullToRefresh({ onRefresh, threshold: 80, enabled: false }),
    );
    act(() => {
      fireTouch('touchstart', 100);
      fireTouch('touchmove', 250);
      fireTouch('touchend', 250);
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
