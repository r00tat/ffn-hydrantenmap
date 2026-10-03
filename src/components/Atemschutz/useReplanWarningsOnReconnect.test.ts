// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
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

const sync = vi.hoisted(() => ({
  order: [] as string[],
  resolve: null as null | ((ok: boolean) => void),
  wait: true,
}));
vi.mock('../../lib/firestoreSync', () => ({
  waitForFirestoreSync: () => {
    sync.order.push('sync');
    if (!sync.wait) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      sync.resolve = resolve;
    });
  },
}));

const planMock = vi.hoisted(() => vi.fn(async () => 'done' as const));
vi.mock('./ueberwachungWarnungQueue', () => ({
  planWarningOrQueue: planMock,
}));

import useReplanWarningsOnReconnect from './useReplanWarningsOnReconnect';

async function fireReconnect() {
  await act(async () => {
    for (const cb of [...reconnect.callbacks]) cb();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useReplanWarningsOnReconnect', () => {
  beforeEach(() => {
    reconnect.callbacks.clear();
    planMock.mockClear();
    sync.order = [];
    sync.resolve = null;
    sync.wait = false;
  });

  it('plant beim Reconnect alle aktiven Trupps nach', async () => {
    renderHook(() => useReplanWarningsOnReconnect('fc1', ['t1', 't2']));
    expect(planMock).not.toHaveBeenCalled();

    await fireReconnect();
    expect(planMock).toHaveBeenCalledTimes(2);
    expect(planMock).toHaveBeenCalledWith('fc1', 't1');
    expect(planMock).toHaveBeenCalledWith('fc1', 't2');
  });

  it('wartet vor der Planung, bis Firestore die Offline-Änderungen übertragen hat', async () => {
    sync.wait = true;
    renderHook(() => useReplanWarningsOnReconnect('fc1', ['t1']));
    await fireReconnect();
    expect(sync.order).toEqual(['sync']);
    expect(planMock).not.toHaveBeenCalled();

    await act(async () => {
      sync.resolve?.(true);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(planMock).toHaveBeenCalledWith('fc1', 't1');
  });

  it('nimmt die aktuelle Liste, ohne neu abonnieren zu müssen', async () => {
    const { rerender } = renderHook(({ ids }) => useReplanWarningsOnReconnect('fc1', ids), {
      initialProps: { ids: ['t1'] },
    });
    rerender({ ids: ['t3'] });
    expect(reconnect.callbacks.size).toBe(1);

    await fireReconnect();
    expect(planMock).toHaveBeenCalledTimes(1);
    expect(planMock).toHaveBeenCalledWith('fc1', 't3');
  });

  it('tut ohne Einsatz nichts und meldet sich beim Abbau ab', async () => {
    const { unmount } = renderHook(() => useReplanWarningsOnReconnect(undefined, ['t1']));
    await fireReconnect();
    expect(planMock).not.toHaveBeenCalled();
    unmount();
    expect(reconnect.callbacks.size).toBe(0);
  });

  it('verschluckt einen Fehler der Planung', async () => {
    planMock.mockRejectedValueOnce(new Error('boom'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderHook(() => useReplanWarningsOnReconnect('fc1', ['t1']));
    await fireReconnect();
    await act(async () => {
      await Promise.resolve();
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
