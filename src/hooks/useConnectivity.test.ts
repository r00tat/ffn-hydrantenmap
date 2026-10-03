// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkConnectivityNow } from '../lib/connectivity';
import useConnectivity from './useConnectivity';

const fetchMock = vi.fn();

beforeEach(async () => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  await checkConnectivityNow();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useConnectivity', () => {
  it('liefert den aktuellen Zustand des Stores', () => {
    const { result } = renderHook(() => useConnectivity());
    expect(result.current.status).toBe('online');
    expect(result.current.reachable).toBe(true);
  });

  it('rendert neu, wenn der Ping scheitert und wieder klappt', async () => {
    const { result } = renderHook(() => useConnectivity());

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await act(async () => {
      await checkConnectivityNow();
    });
    expect(result.current.status).toBe('offline');

    await act(async () => {
      await checkConnectivityNow();
    });
    expect(result.current.status).toBe('online');
  });
});
