// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FirecallItem } from '../../components/firebase/firestore';
import * as nativeTrackBridge from '../radiacode/nativeTrackBridge';
import { RadiacodeDeviceRef, RadiacodeMeasurement } from '../radiacode/types';
import { useRadiacodePointRecorder } from './useRadiacodePointRecorder';

const DEVICE: RadiacodeDeviceRef = {
  id: 'd1',
  name: 'RC-102',
  serial: 'SN1',
};

function meas(
  dose: number,
  cps: number,
  err?: { doseErr?: number; cpsErr?: number },
): RadiacodeMeasurement {
  return {
    dosisleistung: dose,
    cps,
    timestamp: Date.now(),
    ...(err?.doseErr !== undefined && { dosisleistungErrPct: err.doseErr }),
    ...(err?.cpsErr !== undefined && { cpsErrPct: err.cpsErr }),
  };
}

describe('useRadiacodePointRecorder', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing when inactive', () => {
    const addItem = vi.fn<(item: FirecallItem) => Promise<{ id: string }>>(
      async () => ({ id: 'new' }),
    );
    renderHook(() =>
      useRadiacodePointRecorder({
        active: false,
        layerId: 'layer-1',
        sampleRate: 'normal',
        device: DEVICE,
        measurement: meas(0.1, 5),
        position: { lat: 48.0, lng: 16.0 },
        addItem,
        firecallId: 'fc1',
        creatorEmail: 'u@x',
        firestoreDb: '',
      }),
    );
    expect(addItem).not.toHaveBeenCalled();
  });

  it('does nothing when measurement is null', () => {
    const addItem = vi.fn<(item: FirecallItem) => Promise<{ id: string }>>(
      async () => ({ id: 'new' }),
    );
    renderHook(() =>
      useRadiacodePointRecorder({
        active: true,
        layerId: 'layer-1',
        sampleRate: 'normal',
        device: DEVICE,
        measurement: null,
        position: { lat: 48.0, lng: 16.0 },
        addItem,
        firecallId: 'fc1',
        creatorEmail: 'u@x',
        firestoreDb: '',
      }),
    );
    expect(addItem).not.toHaveBeenCalled();
  });

  it('does nothing when position is null', () => {
    const addItem = vi.fn<(item: FirecallItem) => Promise<{ id: string }>>(
      async () => ({ id: 'new' }),
    );
    renderHook(() =>
      useRadiacodePointRecorder({
        active: true,
        layerId: 'layer-1',
        sampleRate: 'normal',
        device: DEVICE,
        measurement: meas(0.1, 5),
        position: null,
        addItem,
        firecallId: 'fc1',
        creatorEmail: 'u@x',
        firestoreDb: '',
      }),
    );
    expect(addItem).not.toHaveBeenCalled();
  });

  it('writes first sample immediately with fieldData', async () => {
    const addItem = vi.fn<(item: FirecallItem) => Promise<{ id: string }>>(
      async () => ({ id: 'new' }),
    );
    renderHook(() =>
      useRadiacodePointRecorder({
        active: true,
        layerId: 'layer-1',
        sampleRate: 'normal',
        device: DEVICE,
        measurement: meas(0.15, 7),
        position: { lat: 48.0, lng: 16.0 },
        addItem,
        firecallId: 'fc1',
        creatorEmail: 'u@x',
        firestoreDb: '',
      }),
    );
    await vi.waitFor(() => {
      expect(addItem).toHaveBeenCalledTimes(1);
    });
    const item = addItem.mock.calls[0]![0];
    expect(item.type).toBe('marker');
    expect(item.layer).toBe('layer-1');
    expect(item.lat).toBeCloseTo(48.0);
    expect(item.lng).toBeCloseTo(16.0);
    expect(item.fieldData).toEqual({
      dosisleistung: 0.15,
      cps: 7,
      device: 'RC-102 (SN1)',
    });
  });

  it('writes dosisleistungErrPct and cpsErrPct when present', async () => {
    const addItem = vi.fn<(item: FirecallItem) => Promise<{ id: string }>>(
      async () => ({ id: 'new' }),
    );
    renderHook(() =>
      useRadiacodePointRecorder({
        active: true,
        layerId: 'layer-1',
        sampleRate: 'normal',
        device: DEVICE,
        measurement: meas(0.15, 7, { doseErr: 12.3, cpsErr: 4.5 }),
        position: { lat: 48.0, lng: 16.0 },
        addItem,
        firecallId: 'fc1',
        creatorEmail: 'u@x',
        firestoreDb: '',
      }),
    );
    await vi.waitFor(() => {
      expect(addItem).toHaveBeenCalledTimes(1);
    });
    const item = addItem.mock.calls[0]![0];
    expect(item.fieldData).toEqual({
      dosisleistung: 0.15,
      dosisleistungErrPct: 12.3,
      cps: 7,
      cpsErrPct: 4.5,
      device: 'RC-102 (SN1)',
    });
  });

  it('skips second sample when below minInterval', async () => {
    const addItem = vi.fn<(item: FirecallItem) => Promise<{ id: string }>>(
      async () => ({ id: 'new' }),
    );
    const { rerender } = renderHook(
      (props: Parameters<typeof useRadiacodePointRecorder>[0]) =>
        useRadiacodePointRecorder(props),
      {
        initialProps: {
          active: true,
          layerId: 'layer-1',
          sampleRate: 'normal',
          device: DEVICE,
          measurement: meas(0.1, 5),
          position: { lat: 48.0, lng: 16.0 },
          addItem,
          firecallId: 'fc1',
          creatorEmail: 'u@x',
          firestoreDb: '',
        },
      },
    );
    await vi.waitFor(() => {
      expect(addItem).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    rerender({
      active: true,
      layerId: 'layer-1',
      sampleRate: 'normal',
      device: DEVICE,
      measurement: meas(0.2, 10),
      position: { lat: 48.0001, lng: 16.0001 },
      addItem,
      firecallId: 'fc1',
      creatorEmail: 'u@x',
      firestoreDb: '',
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(addItem).toHaveBeenCalledTimes(1);
  });

  it('writes second sample when moved > minDistance after minInterval', async () => {
    const addItem = vi.fn<(item: FirecallItem) => Promise<{ id: string }>>(
      async () => ({ id: 'new' }),
    );
    const { rerender } = renderHook(
      (props: Parameters<typeof useRadiacodePointRecorder>[0]) =>
        useRadiacodePointRecorder(props),
      {
        initialProps: {
          active: true,
          layerId: 'layer-1',
          sampleRate: 'normal',
          device: DEVICE,
          measurement: meas(0.1, 5),
          position: { lat: 48.0, lng: 16.0 },
          addItem,
          firecallId: 'fc1',
          creatorEmail: 'u@x',
          firestoreDb: '',
        },
      },
    );
    await vi.waitFor(() => {
      expect(addItem).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    // ~11m north (~0.0001 deg ≈ 11m)
    rerender({
      active: true,
      layerId: 'layer-1',
      sampleRate: 'normal',
      device: DEVICE,
      measurement: meas(0.12, 6),
      position: { lat: 48.0001, lng: 16.0 },
      addItem,
      firecallId: 'fc1',
      creatorEmail: 'u@x',
      firestoreDb: '',
    });
    await vi.waitFor(() => {
      expect(addItem).toHaveBeenCalledTimes(2);
    });
  });

  it('calls onStart when active flips to true and onStop when going false', async () => {
    const addItem = vi.fn<(item: FirecallItem) => Promise<{ id: string }>>(
      async () => ({ id: 'new' }),
    );
    const onStart = vi.fn(async () => {});
    const onStop = vi.fn(async () => {});
    const { rerender } = renderHook(
      (props: Parameters<typeof useRadiacodePointRecorder>[0]) =>
        useRadiacodePointRecorder(props),
      {
        initialProps: {
          active: false,
          layerId: 'layer-1',
          sampleRate: 'normal',
          device: DEVICE,
          measurement: null,
          position: null,
          addItem,
          onStart,
          onStop,
          firecallId: 'fc1',
          creatorEmail: 'u@x',
          firestoreDb: '',
        },
      },
    );
    expect(onStart).not.toHaveBeenCalled();
    rerender({
      active: true,
      layerId: 'layer-1',
      sampleRate: 'normal',
      device: DEVICE,
      measurement: null,
      position: null,
      addItem,
      onStart,
      onStop,
      firecallId: 'fc1',
      creatorEmail: 'u@x',
      firestoreDb: '',
    });
    await vi.waitFor(() => {
      expect(onStart).toHaveBeenCalledTimes(1);
    });
    expect(onStop).not.toHaveBeenCalled();
    rerender({
      active: false,
      layerId: 'layer-1',
      sampleRate: 'normal',
      device: DEVICE,
      measurement: null,
      position: null,
      addItem,
      onStart,
      onStop,
      firecallId: 'fc1',
      creatorEmail: 'u@x',
      firestoreDb: '',
    });
    await vi.waitFor(() => {
      expect(onStop).toHaveBeenCalledTimes(1);
    });
  });

  it('writes after maxInterval even without moving', async () => {
    const addItem = vi.fn<(item: FirecallItem) => Promise<{ id: string }>>(
      async () => ({ id: 'new' }),
    );
    const { rerender } = renderHook(
      (props: Parameters<typeof useRadiacodePointRecorder>[0]) =>
        useRadiacodePointRecorder(props),
      {
        initialProps: {
          active: true,
          layerId: 'layer-1',
          sampleRate: 'normal',
          device: DEVICE,
          measurement: meas(0.1, 5),
          position: { lat: 48.0, lng: 16.0 },
          addItem,
          firecallId: 'fc1',
          creatorEmail: 'u@x',
          firestoreDb: '',
        },
      },
    );
    await vi.waitFor(() => {
      expect(addItem).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      vi.advanceTimersByTime(16000);
    });
    rerender({
      active: true,
      layerId: 'layer-1',
      sampleRate: 'normal',
      device: DEVICE,
      measurement: meas(0.11, 5),
      position: { lat: 48.0, lng: 16.0 },
      addItem,
      firecallId: 'fc1',
      creatorEmail: 'u@x',
      firestoreDb: '',
    });
    await vi.waitFor(() => {
      expect(addItem).toHaveBeenCalledTimes(2);
    });
  });

  describe('native tracking', () => {
    it('delegates to nativeStartTrack/nativeStopTrack when native and skips addItem', async () => {
      const addItem = vi.fn<(item: FirecallItem) => Promise<{ id: string }>>(
        async () => ({ id: 'new' }),
      );
      const isAvail = vi
        .spyOn(nativeTrackBridge, 'isNativeTrackingAvailable')
        .mockReturnValue(true);
      const start = vi
        .spyOn(nativeTrackBridge, 'nativeStartTrack')
        .mockResolvedValue(undefined);
      const stop = vi
        .spyOn(nativeTrackBridge, 'nativeStopTrack')
        .mockResolvedValue(undefined);

      const { rerender, unmount } = renderHook(
        (props: Parameters<typeof useRadiacodePointRecorder>[0]) =>
          useRadiacodePointRecorder(props),
        {
          initialProps: {
            active: false,
            layerId: 'l1',
            sampleRate: 'normal',
            device: DEVICE,
            measurement: null,
            position: null,
            addItem,
            firecallId: 'fc1',
            creatorEmail: 'u@x',
            firestoreDb: '',
          },
        },
      );
      rerender({
        active: true,
        layerId: 'l1',
        sampleRate: 'normal',
        device: DEVICE,
        measurement: meas(0.1, 5),
        position: { lat: 48, lng: 16 },
        addItem,
        firecallId: 'fc1',
        creatorEmail: 'u@x',
        firestoreDb: '',
      });
      await vi.waitFor(() => {
        expect(start).toHaveBeenCalledTimes(1);
      });
      expect(start).toHaveBeenCalledWith({
        firecallId: 'fc1',
        layerId: 'l1',
        sampleRate: 'normal',
        deviceLabel: 'RC-102 (SN1)',
        creator: 'u@x',
        firestoreDb: '',
      });
      expect(addItem).not.toHaveBeenCalled();

      unmount();
      await vi.waitFor(() => {
        expect(stop).toHaveBeenCalledTimes(1);
      });

      isAvail.mockRestore();
      start.mockRestore();
      stop.mockRestore();
    });
  });
});
