// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FirecallItem } from '../../components/firebase/firestore';
import { RadiacodeDeviceRef, RadiacodeMeasurement } from '../radiacode/types';
import { useRadiacodePointRecorder } from './useRadiacodePointRecorder';

const DEVICE: RadiacodeDeviceRef = {
  id: 'd1',
  name: 'RC-102',
  serial: 'SN1',
};

function meas(dose: number, cps: number): RadiacodeMeasurement {
  return { dosisleistung: dose, cps, timestamp: Date.now() };
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
    });
    await vi.waitFor(() => {
      expect(addItem).toHaveBeenCalledTimes(2);
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
    });
    await vi.waitFor(() => {
      expect(addItem).toHaveBeenCalledTimes(2);
    });
  });
});
