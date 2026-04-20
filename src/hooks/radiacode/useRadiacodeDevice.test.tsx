// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BleAdapter } from './bleAdapter';
import { RadiacodeDeviceRef, RadiacodeMeasurement } from './types';
import { useRadiacodeDevice } from './useRadiacodeDevice';

interface MockAdapter extends BleAdapter {
  emit: (bytes: Uint8Array) => void;
  connectCalls: string[];
  disconnectCalls: string[];
}

function makeAdapter(overrides: Partial<BleAdapter> = {}): MockAdapter {
  let handler: ((p: Uint8Array) => void) | null = null;
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
    onNotification: vi.fn(async (_id, h) => {
      handler = h;
      return () => {
        handler = null;
      };
    }),
    write: vi.fn(async () => {}),
    ...overrides,
    emit(bytes: Uint8Array) {
      handler?.(bytes);
    },
    connectCalls,
    disconnectCalls,
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

  it('connect after scan moves status to connected', async () => {
    const adapter = makeAdapter();
    const { result } = renderHook(() => useRadiacodeDevice(adapter));
    await act(async () => {
      await result.current.scan();
    });
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.status).toBe('connected');
    expect(adapter.connectCalls).toEqual(['d1']);
  });

  it('sets measurement when parser returns a value', async () => {
    const adapter = makeAdapter();
    const parser = vi.fn(
      (_bytes: Uint8Array): RadiacodeMeasurement | null => ({
        dosisleistung: 0.14,
        cps: 5,
        timestamp: 1234,
      }),
    );
    const { result } = renderHook(() => useRadiacodeDevice(adapter, parser));
    await act(async () => {
      await result.current.scan();
    });
    await act(async () => {
      await result.current.connect();
    });
    await act(async () => {
      adapter.emit(new Uint8Array([1, 2, 3]));
    });
    expect(result.current.measurement).toMatchObject({
      dosisleistung: 0.14,
      cps: 5,
    });
    expect(parser).toHaveBeenCalledTimes(1);
  });

  it('ignores null parser result (stub mode)', async () => {
    const adapter = makeAdapter();
    const { result } = renderHook(() => useRadiacodeDevice(adapter, () => null));
    await act(async () => {
      await result.current.scan();
    });
    await act(async () => {
      await result.current.connect();
    });
    await act(async () => {
      adapter.emit(new Uint8Array([1, 2, 3]));
    });
    expect(result.current.measurement).toBeNull();
  });

  it('disconnect resets status and calls adapter.disconnect', async () => {
    const adapter = makeAdapter();
    const { result } = renderHook(() => useRadiacodeDevice(adapter));
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
    expect(adapter.disconnectCalls).toEqual(['d1']);
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
});
