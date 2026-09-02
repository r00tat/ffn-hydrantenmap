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

const deviceIdMock = vi.hoisted(() => vi.fn(() => 'devaaaaaaaaa'));

vi.mock('../common/liveLocationDevice', () => ({
  DEVICE_STORAGE_KEY: 'liveLocationDevice/v1',
  liveLocationDeviceId: () => deviceIdMock(),
  liveLocationDeviceLabel: () => 'Windows',
}));

import { useLiveLocations } from './useLiveLocations';

const makeTimestamp = (ms: number): Timestamp => Timestamp.fromMillis(ms);

describe('useLiveLocations', () => {
  beforeEach(() => {
    useFirebaseCollectionMock.mockReset();
    useFirecallIdMock.mockReset().mockReturnValue('firecall-1');
    useFirebaseLoginMock.mockReset().mockReturnValue({ uid: 'me' });
    deviceIdMock.mockReset().mockReturnValue('devaaaaaaaaa');
  });

  it('returns empty array when no records', () => {
    useFirebaseCollectionMock.mockReturnValue([]);
    const { result } = renderHook(() => useLiveLocations());
    expect(result.current).toEqual([]);
  });

  it('filters out this device, not the whole account', () => {
    const now = Date.now();
    useFirebaseCollectionMock.mockReturnValue([
      {
        id: 'me_devaaaaaaaaa',
        uid: 'me',
        deviceId: 'devaaaaaaaaa',
        name: 'Me',
        email: 'me@example.com',
        lat: 0,
        lng: 0,
        updatedAt: makeTimestamp(now),
        expiresAt: makeTimestamp(now + 1_000_000),
      },
      {
        id: 'other_devbbbbbbbbb',
        uid: 'other',
        deviceId: 'devbbbbbbbbb',
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

  // Der Kern des Nachtrags zu #760: dasselbe Konto auf Tablet und Desktop.
  // Das andere Gerät muss sichtbar sein, nur das eigene fällt weg.
  it('keeps another device of the same account', () => {
    const now = Date.now();
    useFirebaseCollectionMock.mockReturnValue([
      {
        id: 'me_devaaaaaaaaa',
        uid: 'me',
        deviceId: 'devaaaaaaaaa',
        deviceLabel: 'Windows',
        name: 'Me',
        email: 'me@example.com',
        lat: 0,
        lng: 0,
        updatedAt: makeTimestamp(now),
        expiresAt: makeTimestamp(now + 1_000_000),
      },
      {
        id: 'me_devbbbbbbbbb',
        uid: 'me',
        deviceId: 'devbbbbbbbbb',
        deviceLabel: 'Android',
        name: 'Me',
        email: 'me@example.com',
        lat: 1,
        lng: 1,
        updatedAt: makeTimestamp(now),
        expiresAt: makeTimestamp(now + 1_000_000),
      },
    ]);

    const { result } = renderHook(() => useLiveLocations());
    expect(result.current).toHaveLength(1);
    expect(result.current[0].id).toBe('me_devbbbbbbbbb');
    expect(result.current[0].deviceLabel).toBe('Android');
  });

  // Dokumente aus der Zeit vor der Geräte-ID heißen wie die uid. Das eigene
  // Altdokument gehört weg (sonst steht der eigene Pin doppelt herum), ein
  // fremdes bleibt.
  it('drops the own legacy document but keeps a foreign one', () => {
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

  // Das Gerät im Namen ist nur dann Information, wenn eine Person mehrfach auf
  // der Karte steht — sonst hätte jeder Marker ein „(Android)" am Namen.
  describe('showDeviceLabel', () => {
    const record = (id: string, uid: string, deviceLabel: string) => ({
      id,
      uid,
      deviceId: id.split('_')[1] ?? '',
      deviceLabel,
      name: uid,
      email: `${uid}@example.com`,
      lat: 0,
      lng: 0,
      updatedAt: makeTimestamp(Date.now()),
      expiresAt: makeTimestamp(Date.now() + 1_000_000),
    });

    it('is false when everyone appears once', () => {
      useFirebaseCollectionMock.mockReturnValue([
        record('a_dev1', 'a', 'Android'),
        record('b_dev2', 'b', 'Windows'),
      ]);
      const { result } = renderHook(() => useLiveLocations());
      expect(result.current.map((r) => r.showDeviceLabel)).toEqual([
        false,
        false,
      ]);
    });

    it('is true for every entry of a person with two devices', () => {
      useFirebaseCollectionMock.mockReturnValue([
        record('a_dev1', 'a', 'Android'),
        record('a_dev2', 'a', 'Windows'),
        record('b_dev3', 'b', 'Windows'),
      ]);
      const { result } = renderHook(() => useLiveLocations());
      const byId = new Map(
        result.current.map((r) => [r.id, r.showDeviceLabel]),
      );
      expect(byId.get('a_dev1')).toBe(true);
      expect(byId.get('a_dev2')).toBe(true);
      expect(byId.get('b_dev3')).toBe(false);
    });
  });

  // #760: Die Live-Standorte der anderen hängen bewusst nicht an der eigenen
  // Freigabe — die Einsatzleitung teilt selbst nichts und muss die Kräfte
  // trotzdem sehen. Ohne eigenes Dokument in der Collection darf der Filter
  // auf die eigene uid also nichts wegnehmen.
  it('returns other users even when the current user shares nothing', () => {
    const now = Date.now();
    useFirebaseCollectionMock.mockReturnValue([
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
