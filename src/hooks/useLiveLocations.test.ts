// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { Timestamp } from 'firebase/firestore';
import { STALE_HARD_CUTOFF_MS } from '../common/liveLocation';

const useFirebaseCollectionMock = vi.hoisted(() => vi.fn());
const useFirecallIdMock = vi.hoisted(() => vi.fn(() => 'firecall-1'));
const useFirebaseLoginMock = vi.hoisted(() => vi.fn(() => ({ uid: 'me' })));

vi.mock('./useFirebaseCollection', () => ({
  default: useFirebaseCollectionMock,
}));

vi.mock('./useFirecall', () => ({
  useFirecallId: useFirecallIdMock,
}));

vi.mock('./useFirebaseLogin', () => ({
  default: useFirebaseLoginMock,
}));

import { useLiveLocations } from './useLiveLocations';

const makeTimestamp = (ms: number): Timestamp => Timestamp.fromMillis(ms);

describe('useLiveLocations', () => {
  beforeEach(() => {
    useFirebaseCollectionMock.mockReset();
    useFirecallIdMock.mockReset().mockReturnValue('firecall-1');
    useFirebaseLoginMock.mockReset().mockReturnValue({ uid: 'me' });
  });

  it('returns empty array when no records', () => {
    useFirebaseCollectionMock.mockReturnValue([]);
    const { result } = renderHook(() => useLiveLocations());
    expect(result.current).toEqual([]);
  });

  it('filters out the current user (own uid)', () => {
    const now = Date.now();
    useFirebaseCollectionMock.mockReturnValue([
      {
        id: 'me',
        uid: 'me',
        name: 'Me',
        email: 'me@example.com',
        lat: 0,
        lng: 0,
        updatedAt: makeTimestamp(now),
        expiresAt: makeTimestamp(now + 1_000_000),
      },
      {
        id: 'other',
        uid: 'other',
        name: 'Other',
        email: 'other@example.com',
        lat: 1,
        lng: 1,
        updatedAt: makeTimestamp(now),
        expiresAt: makeTimestamp(now + 1_000_000),
      },
    ]);

    const { result } = renderHook(() => useLiveLocations());
    expect(result.current).toHaveLength(1);
    expect(result.current[0].uid).toBe('other');
  });

  it('filters out stale records older than 5 minutes', () => {
    const now = Date.now();
    const stale = now - STALE_HARD_CUTOFF_MS - 1_000;
    useFirebaseCollectionMock.mockReturnValue([
      {
        id: 'fresh',
        uid: 'fresh',
        name: 'Fresh',
        email: 'fresh@example.com',
        lat: 0,
        lng: 0,
        updatedAt: makeTimestamp(now),
        expiresAt: makeTimestamp(now + 1_000_000),
      },
      {
        id: 'stale',
        uid: 'stale',
        name: 'Stale',
        email: 'stale@example.com',
        lat: 0,
        lng: 0,
        updatedAt: makeTimestamp(stale),
        expiresAt: makeTimestamp(stale + 1_000_000),
      },
    ]);

    const { result } = renderHook(() => useLiveLocations());
    expect(result.current).toHaveLength(1);
    expect(result.current[0].uid).toBe('fresh');
  });

  it('exposes updatedAtMs derived from Firestore Timestamp', () => {
    const ts = 1_700_000_000_000;
    useFirebaseCollectionMock.mockReturnValue([
      {
        id: 'a',
        uid: 'a',
        name: 'A',
        email: 'a@example.com',
        lat: 0,
        lng: 0,
        updatedAt: makeTimestamp(ts),
        expiresAt: makeTimestamp(ts + 1_000_000),
      },
    ]);
    // Spy Date.now so the freshness check uses a value just after ts
    vi.spyOn(Date, 'now').mockReturnValue(ts + 1_000);

    const { result } = renderHook(() => useLiveLocations());
    expect(result.current).toHaveLength(1);
    expect(result.current[0].updatedAtMs).toBe(ts);

    vi.restoreAllMocks();
  });

  it('handles missing updatedAt by treating it as 0 (filtered as stale)', () => {
    useFirebaseCollectionMock.mockReturnValue([
      {
        id: 'no-ts',
        uid: 'no-ts',
        name: 'NoTs',
        email: 'nots@example.com',
        lat: 0,
        lng: 0,
        // updatedAt missing
      },
    ]);

    const { result } = renderHook(() => useLiveLocations());
    expect(result.current).toEqual([]);
  });
});
