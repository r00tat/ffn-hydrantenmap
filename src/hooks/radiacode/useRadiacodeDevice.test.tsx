// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BleAdapter } from './bleAdapter';
import { RadiacodeClient } from './client';
import { RadiacodeDeviceRef, RadiacodeMeasurement } from './types';
import { useRadiacodeDevice } from './useRadiacodeDevice';

interface MockAdapter extends BleAdapter {
  connectCalls: string[];
  disconnectCalls: string[];
}

function makeAdapter(overrides: Partial<BleAdapter> = {}): MockAdapter {
  const connectCalls: string[] = [];
  const disconnectCalls: string[] = [];
  const device: RadiacodeDeviceRef = { id: 'd1', name: 'RC-102', serial: 'SN1' };
  return {
    isSupported: () => true,
    requestDevice: vi.fn(async () => device),
    connect: vi.fn(async (id: string) => {
      connectCalls.push(id);
    }),
    disconnect: vi.fn(async (id: string) => {
      disconnectCalls.push(id);
    }),
    onNotification: vi.fn(async () => () => {}),
    write: vi.fn(async () => {}),
    ...overrides,
    connectCalls,
    disconnectCalls,
  };
}

interface FakeClient extends RadiacodeClient {
  emit: (m: RadiacodeMeasurement) => void;
}

function makeFakeClientFactory(): {
  factory: (adapter: BleAdapter, deviceId: string) => RadiacodeClient;
  latest: () => FakeClient | null;
} {
  let last: FakeClient | null = null;
  return {
    factory: () => {
      let emitter: ((m: RadiacodeMeasurement) => void) | null = null;
      const client = {
        connect: vi.fn(async () => {}),
        startPolling: vi.fn((cb: (m: RadiacodeMeasurement) => void) => {
          emitter = cb;
        }),
        disconnect: vi.fn(async () => {}),
        emit: (m: RadiacodeMeasurement) => emitter?.(m),
      } as unknown as FakeClient;
      last = client;
      return client;
    },
    latest: () => last,
  };
}

describe('useRadiacodeDevice', () => {
  it('starts in idle state', () => {
    const { result } = renderHook(() => useRadiacodeDevice(makeAdapter()));
    expect(result.current.status).toBe('idle');
    expect(result.current.device).toBeNull();
    expect(result.current.measurement).toBeNull();
  });

  it('scan sets device and returns it', async () => {
    const adapter = makeAdapter();
    const { result } = renderHook(() => useRadiacodeDevice(adapter));
    let scanned: RadiacodeDeviceRef | null = null;
    await act(async () => {
      scanned = await result.current.scan();
    });
    expect((scanned as RadiacodeDeviceRef | null)?.id).toBe('d1');
    expect(result.current.device?.id).toBe('d1');
    expect(result.current.status).toBe('idle');
  });

  it('connect after scan runs client init and moves to connected', async () => {
    const adapter = makeAdapter();
    const { factory, latest } = makeFakeClientFactory();
    const { result } = renderHook(() =>
      useRadiacodeDevice(adapter, { clientFactory: factory }),
    );
    await act(async () => {
      await result.current.scan();
    });
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.status).toBe('connected');
    expect(adapter.connectCalls).toEqual(['d1']);
    expect(latest()?.connect).toHaveBeenCalled();
    expect(latest()?.startPolling).toHaveBeenCalled();
  });

  it('emits measurement from client callback', async () => {
    const adapter = makeAdapter();
    const { factory, latest } = makeFakeClientFactory();
    const { result } = renderHook(() =>
      useRadiacodeDevice(adapter, { clientFactory: factory }),
    );
    await act(async () => {
      await result.current.scan();
    });
    await act(async () => {
      await result.current.connect();
    });
    const m: RadiacodeMeasurement = {
      dosisleistung: 0.14,
      cps: 5,
      timestamp: 1234,
    };
    await act(async () => {
      latest()?.emit(m);
    });
    expect(result.current.measurement).toMatchObject({
      dosisleistung: 0.14,
      cps: 5,
    });
  });

  it('preserves dose/temperatureC/chargePct from earlier RareRecord across polls without them', async () => {
    const adapter = makeAdapter();
    const { factory, latest } = makeFakeClientFactory();
    const { result } = renderHook(() =>
      useRadiacodeDevice(adapter, { clientFactory: factory }),
    );
    await act(async () => {
      await result.current.scan();
    });
    await act(async () => {
      await result.current.connect();
    });
    await act(async () => {
      latest()?.emit({
        dosisleistung: 0.1,
        cps: 3,
        timestamp: 1,
        dose: 420,
        temperatureC: 24.5,
        chargePct: 88,
      });
    });
    await act(async () => {
      latest()?.emit({ dosisleistung: 0.2, cps: 5, timestamp: 2 });
    });
    expect(result.current.measurement).toMatchObject({
      dosisleistung: 0.2,
      cps: 5,
      dose: 420,
      temperatureC: 24.5,
      chargePct: 88,
    });
  });

  it('disconnect stops client and resets state', async () => {
    const adapter = makeAdapter();
    const { factory, latest } = makeFakeClientFactory();
    const { result } = renderHook(() =>
      useRadiacodeDevice(adapter, { clientFactory: factory }),
    );
    await act(async () => {
      await result.current.scan();
    });
    await act(async () => {
      await result.current.connect();
    });
    await act(async () => {
      await result.current.disconnect();
    });
    expect(result.current.status).toBe('idle');
    expect(latest()?.disconnect).toHaveBeenCalled();
  });

  it('scan failure sets error status', async () => {
    const adapter = makeAdapter({
      requestDevice: vi.fn(async () => {
        throw new Error('User cancelled');
      }),
    });
    const { result } = renderHook(() => useRadiacodeDevice(adapter));
    await act(async () => {
      await result.current.scan();
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('User cancelled');
  });

  it('connect failure sets error status', async () => {
    const adapter = makeAdapter();
    const failingFactory = () =>
      ({
        connect: vi.fn(async () => {
          throw new Error('init failed');
        }),
        startPolling: vi.fn(),
        disconnect: vi.fn(async () => {}),
      }) as unknown as RadiacodeClient;
    const { result } = renderHook(() =>
      useRadiacodeDevice(adapter, { clientFactory: failingFactory }),
    );
    await act(async () => {
      await result.current.scan();
    });
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('init failed');
  });
});
