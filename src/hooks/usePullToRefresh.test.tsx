// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePullToRefresh } from './usePullToRefresh';

function fireTouch(type: string, y: number, target?: EventTarget) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    touches: [{ clientY: y }],
    changedTouches: [{ clientY: y }],
  });
  (target ?? document).dispatchEvent(event);
}

describe('usePullToRefresh', () => {
  afterEach(() => {
    // Alle im Test angelegten Container wieder entfernen.
    const nodes = Array.from(document.body.children);
    for (const n of nodes) n.remove();
  });

  it('ruft onRefresh, wenn Pull-Distanz abzüglich Dead-Zone > Schwelle', () => {
    const onRefresh = vi.fn();
    renderHook(() =>
      usePullToRefresh({ onRefresh, threshold: 80, enabled: true }),
    );

    act(() => {
      // +150 px, minus 30 Dead-Zone = 120 effektiv > 80 Threshold
      fireTouch('touchstart', 100);
      fireTouch('touchmove', 250);
      fireTouch('touchend', 250);
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

  it('ruft onRefresh NICHT innerhalb der Dead-Zone', () => {
    const onRefresh = vi.fn();
    renderHook(() =>
      usePullToRefresh({ onRefresh, threshold: 80, enabled: true }),
    );
    act(() => {
      // 25 px — unterhalb der 30 px Dead-Zone, kein Pull darf registriert werden.
      fireTouch('touchstart', 100);
      fireTouch('touchmove', 125);
      fireTouch('touchend', 125);
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  function buildScrollableContainer(scrollTop: number) {
    const container = document.createElement('div');
    container.style.overflowY = 'auto';
    Object.defineProperty(container, 'scrollHeight', {
      value: 2000,
      configurable: true,
    });
    Object.defineProperty(container, 'clientHeight', {
      value: 500,
      configurable: true,
    });
    Object.defineProperty(container, 'scrollTop', {
      value: scrollTop,
      configurable: true,
    });
    const child = document.createElement('div');
    container.appendChild(child);
    document.body.appendChild(container);
    return { container, child };
  }

  it('ruft onRefresh NICHT, wenn ein scrollbarer Container nicht oben ist', () => {
    const { child } = buildScrollableContainer(120);

    const onRefresh = vi.fn();
    renderHook(() =>
      usePullToRefresh({ onRefresh, threshold: 80, enabled: true }),
    );

    act(() => {
      fireTouch('touchstart', 100, child);
      fireTouch('touchmove', 260, child);
      fireTouch('touchend', 260, child);
    });

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('ruft onRefresh, wenn der scrollbare Container am Anfang steht', () => {
    const { child } = buildScrollableContainer(0);

    const onRefresh = vi.fn();
    renderHook(() =>
      usePullToRefresh({ onRefresh, threshold: 80, enabled: true }),
    );

    act(() => {
      fireTouch('touchstart', 100, child);
      fireTouch('touchmove', 260, child);
      fireTouch('touchend', 260, child);
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
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
