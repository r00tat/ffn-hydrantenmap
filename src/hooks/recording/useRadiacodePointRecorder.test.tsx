// @vitest-environment jsdom
import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next-auth', () => ({
  default: vi.fn(() => ({
    handlers: {},
    signIn: vi.fn(),
    signOut: vi.fn(),
    auth: vi.fn(),
  })),
}));
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({ data: null, status: 'unauthenticated' })),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(),
  ref: vi.fn(),
  uploadBytesResumable: vi.fn(),
  getDownloadURL: vi.fn(),
}));
vi.mock('firebase/app', () => ({
  getApp: vi.fn(),
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
}));
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
}));

// Mock Firebase related hooks
vi.mock('../../hooks/useFirecallItemAdd', () => ({
  default: vi.fn(() => vi.fn(async () => ({ id: 'new-doc' }))),
}));
vi.mock('../../hooks/useFirecall', () => ({
  useFirecallId: vi.fn(() => 'fc-1'),
}));
vi.mock('../../hooks/useFirebaseLogin', () => ({
  default: vi.fn(() => ({ email: 'test@example.com', isAuthorized: true })),
}));
vi.mock('../../hooks/useAuditLog', () => ({
  useAuditLog: vi.fn(() => vi.fn()),
}));
vi.mock('../../components/firebase/firebase', () => ({
  default: {},
  app: {},
  firebaseApp: {},
  firestore: {},
  db: {},
  auth: {},
}));

import type { FirecallItem } from '../../components/firebase/firestore';
import { RadiacodeDeviceRef, RadiacodeMeasurement } from '../radiacode/types';
import { useRadiacodePointRecorder } from './useRadiacodePointRecorder';
import { GpsProvider } from '../../components/providers/GpsProvider';
import { PositionProvider } from '../../components/providers/PositionProvider';
import { RadiacodeProvider } from '../../components/providers/RadiacodeProvider';

const DEVICE: RadiacodeDeviceRef = {
  id: 'd1',
  name: 'RC-102',
  serial: 'SN1',
};

// Mock RadiacodeNotification
vi.mock('../../hooks/radiacode/radiacodeNotification', () => ({
  RadiacodeNotification: {
    getState: vi.fn().mockResolvedValue({
      connected: false,
      deviceAddress: null,
      radiacodeTracking: false,
      gpsTracking: false,
    }),
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
  },
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PositionProvider>
    <RadiacodeProvider>
      <GpsProvider>{children}</GpsProvider>
    </RadiacodeProvider>
  </PositionProvider>
);

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
        firecallId: 'fc-1',
        creatorEmail: 'p@nd.at',
      }),
      { wrapper },
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
      { wrapper },
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
      { wrapper },
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
      { wrapper },
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
      { wrapper },
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
        wrapper,
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
        wrapper,
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
        wrapper,
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
        wrapper,
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

  it('Custom-Rate: zweite Messung unter intervalSec-Threshold wird NICHT geschrieben', async () => {
    const addItem = vi.fn<(item: FirecallItem) => Promise<{ id: string }>>(
      async () => ({ id: 'm1' }),
    );

    const { rerender } = renderHook(
      (props: Parameters<typeof useRadiacodePointRecorder>[0]) =>
        useRadiacodePointRecorder(props),
      {
        wrapper,
        initialProps: {
          active: true,
          layerId: 'l1',
          sampleRate: { kind: 'custom', intervalSec: 10 } as const,
          device: DEVICE,
          measurement: meas(0.1, 5),
          position: { lat: 48, lng: 16 },
          addItem,
          firecallId: 'fc1',
          creatorEmail: 'u@x',
          firestoreDb: '',
        },
      },
    );
    await vi.waitFor(() => expect(addItem).toHaveBeenCalledTimes(1));

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    // second measurement quickly → below 10s interval, no distance change → no write
    rerender({
      active: true,
      layerId: 'l1',
      sampleRate: { kind: 'custom', intervalSec: 10 } as const,
      device: DEVICE,
      measurement: meas(0.11, 5),
      position: { lat: 48, lng: 16 },
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
});
