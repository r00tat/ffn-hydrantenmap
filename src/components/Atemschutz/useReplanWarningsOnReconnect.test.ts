// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const reconnect = vi.hoisted(() => ({
  callbacks: new Set<() => void>(),
}));
vi.mock('../../lib/connectivity', () => ({
  onReconnect: (cb: () => void) => {
    reconnect.callbacks.add(cb);
    return () => reconnect.callbacks.delete(cb);
  },
}));

const planMock = vi.hoisted(() => vi.fn(async () => 'done' as const));
vi.mock('./ueberwachungWarnungQueue', () => ({
  planWarningOrQueue: planMock,
}));

import useReplanWarningsOnReconnect from './useReplanWarningsOnReconnect';

function fireReconnect() {
  for (const cb of [...reconnect.callbacks]) cb();
}

describe('useReplanWarningsOnReconnect', () => {
  beforeEach(() => {
    reconnect.callbacks.clear();
    planMock.mockClear();
  });

  it('plant beim Reconnect alle aktiven Trupps nach', () => {
    renderHook(() => useReplanWarningsOnReconnect('fc1', ['t1', 't2']));
    expect(planMock).not.toHaveBeenCalled();

    fireReconnect();
    expect(planMock).toHaveBeenCalledTimes(2);
    expect(planMock).toHaveBeenCalledWith('fc1', 't1');
    expect(planMock).toHaveBeenCalledWith('fc1', 't2');
  });

  it('nimmt die aktuelle Liste, ohne neu abonnieren zu müssen', () => {
    const { rerender } = renderHook(({ ids }) => useReplanWarningsOnReconnect('fc1', ids), {
      initialProps: { ids: ['t1'] },
    });
    rerender({ ids: ['t3'] });
    expect(reconnect.callbacks.size).toBe(1);

    fireReconnect();
    expect(planMock).toHaveBeenCalledTimes(1);
    expect(planMock).toHaveBeenCalledWith('fc1', 't3');
  });

  it('tut ohne Einsatz nichts und meldet sich beim Abbau ab', () => {
    const { unmount } = renderHook(() => useReplanWarningsOnReconnect(undefined, ['t1']));
    fireReconnect();
    expect(planMock).not.toHaveBeenCalled();
    unmount();
    expect(reconnect.callbacks.size).toBe(0);
  });

  it('verschluckt einen Fehler der Planung', async () => {
    planMock.mockRejectedValueOnce(new Error('boom'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderHook(() => useReplanWarningsOnReconnect('fc1', ['t1']));
    fireReconnect();
    await Promise.resolve();
    await Promise.resolve();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
