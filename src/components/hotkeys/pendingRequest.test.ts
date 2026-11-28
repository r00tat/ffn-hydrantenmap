// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  createPendingRequest,
  focusPoints,
  usePendingRequest,
} from './pendingRequest';

describe('createPendingRequest', () => {
  it('keeps a request until it is taken once', () => {
    const store = createPendingRequest<string>();
    store.request('a');
    expect(store.take()).toBe('a');
    expect(store.take()).toBeUndefined();
  });
});

describe('usePendingRequest', () => {
  it('handles a request made before mount and later ones', () => {
    const store = createPendingRequest<string>();
    const handler = vi.fn();
    store.request('before');
    const { unmount } = renderHook(() => usePendingRequest(store, handler));
    expect(handler).toHaveBeenCalledWith('before');
    store.request('after');
    expect(handler).toHaveBeenCalledWith('after');
    unmount();
    store.request('unmounted');
    expect(handler).toHaveBeenCalledTimes(2);
    expect(store.take()).toBe('unmounted');
  });
});

describe('focusPoints', () => {
  it('uses the vertices of a line or area', () => {
    expect(
      focusPoints({ lat: 1, lng: 2, positions: '[[47.9,16.8],[47.95,16.85]]' }),
    ).toEqual([
      [47.9, 16.8],
      [47.95, 16.85],
    ]);
  });

  it('falls back to position and destination', () => {
    expect(focusPoints({ lat: 1, lng: 2, destLat: 3, destLng: 4, positions: 'x' })).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(focusPoints({})).toEqual([]);
  });
});
