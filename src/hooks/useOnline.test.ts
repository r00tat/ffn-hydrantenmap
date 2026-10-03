// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkConnectivityNow } from '../lib/connectivity';
import useOnline from './useOnline';

const fetchMock = vi.fn();

beforeEach(async () => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  await checkConnectivityNow();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useOnline', () => {
  it('meldet true, solange der Server erreichbar ist', () => {
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);
  });

  it('meldet false, wenn der Ping scheitert — auch bei navigator.onLine === true', async () => {
    const { result } = renderHook(() => useOnline());
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await act(async () => {
      await checkConnectivityNow();
    });
    expect(navigator.onLine).toBe(true);
    expect(result.current).toBe(false);
  });
});
