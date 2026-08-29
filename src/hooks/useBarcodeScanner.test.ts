// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import useBarcodeScanner from './useBarcodeScanner';

function mockMediaDevices(getUserMedia: () => Promise<MediaStream>) {
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis as object, 'BarcodeDetector');
  Reflect.deleteProperty(globalThis.navigator as object, 'mediaDevices');
});

describe('useBarcodeScanner', () => {
  it('bleibt untätig, solange active false ist', () => {
    mockMediaDevices(vi.fn());
    const { result } = renderHook(() =>
      useBarcodeScanner({ active: false, onDetected: vi.fn() }),
    );
    expect(result.current.status).toBe('idle');
  });

  it('meldet unsupported ohne mediaDevices', async () => {
    Reflect.deleteProperty(globalThis.navigator as object, 'mediaDevices');
    const { result } = renderHook(() =>
      useBarcodeScanner({ active: true, onDetected: vi.fn() }),
    );
    await waitFor(() => expect(result.current.status).toBe('unsupported'));
  });

  it('meldet denied, wenn der Benutzer die Kamera ablehnt', async () => {
    const err = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    mockMediaDevices(() => Promise.reject(err));
    const { result } = renderHook(() =>
      useBarcodeScanner({ active: true, onDetected: vi.fn() }),
    );
    await waitFor(() => expect(result.current.status).toBe('denied'));
  });

  it('meldet error bei jedem anderen Kamerafehler', async () => {
    mockMediaDevices(() =>
      Promise.reject(Object.assign(new Error('kaputt'), { name: 'NotReadableError' })),
    );
    const { result } = renderHook(() =>
      useBarcodeScanner({ active: true, onDetected: vi.fn() }),
    );
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorMessage).toBe('kaputt');
  });

  it('stoppt alle Tracks beim Aufräumen', async () => {
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    mockMediaDevices(() => Promise.resolve(stream));
    const { unmount, result } = renderHook(() =>
      useBarcodeScanner({ active: true, onDetected: vi.fn() }),
    );
    await waitFor(() => expect(result.current.status).not.toBe('idle'));
    unmount();
    await waitFor(() => expect(stop).toHaveBeenCalled());
  });
});
