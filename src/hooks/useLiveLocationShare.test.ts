// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../components/firebase/firebase', () => ({
  default: {},
  firestore: { type: 'mock-firestore' },
}));

const setDocMock = vi.hoisted(() =>
  vi.fn((_ref: unknown, _data?: unknown) => Promise.resolve()),
);
const deleteDocMock = vi.hoisted(() =>
  vi.fn((_ref: unknown) => Promise.resolve()),
);

vi.mock('../lib/firestoreClient', () => ({
  setDoc: setDocMock,
  deleteDoc: deleteDocMock,
}));

const docMock = vi.hoisted(() =>
  vi.fn((...segments: unknown[]) => ({ path: segments.slice(1).join('/') })),
);

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => docMock(...args),
  serverTimestamp: () => ({ type: 'mock-server-ts' }),
  Timestamp: { fromMillis: (ms: number) => ({ type: 'mock-ts', ms }) },
}));

import {
  shouldSendUpdate,
  distanceMeters,
  useLiveLocationShare,
} from './useLiveLocationShare';

const settings = { heartbeatMs: 30_000, distanceM: 20 };

describe('shouldSendUpdate (OR logic)', () => {
  it('triggers on first call (no lastSent)', () => {
    expect(
      shouldSendUpdate(undefined, 1_000, undefined, { lat: 0, lng: 0 }, settings)
    ).toBe(true);
  });

  it('triggers when heartbeat elapsed without movement', () => {
    expect(
      shouldSendUpdate(0, 30_001, { lat: 0, lng: 0 }, { lat: 0, lng: 0 }, settings)
    ).toBe(true);
  });

  it('does not trigger before heartbeat without movement', () => {
    expect(
      shouldSendUpdate(0, 29_000, { lat: 0, lng: 0 }, { lat: 0, lng: 0 }, settings)
    ).toBe(false);
  });

  it('triggers on distance threshold even before heartbeat', () => {
    // 0.0002 deg lat ≈ 22 m
    expect(
      shouldSendUpdate(
        0,
        5_000,
        { lat: 0, lng: 0 },
        { lat: 0.0002, lng: 0 },
        settings
      )
    ).toBe(true);
  });

  it('does not trigger on small movement before heartbeat', () => {
    // 0.00005 deg lat ≈ 5.5 m
    expect(
      shouldSendUpdate(
        0,
        5_000,
        { lat: 0, lng: 0 },
        { lat: 0.00005, lng: 0 },
        settings
      )
    ).toBe(false);
  });
});

describe('distanceMeters', () => {
  it('is roughly 0 for identical coords', () => {
    expect(distanceMeters({ lat: 47, lng: 16 }, { lat: 47, lng: 16 })).toBeLessThan(
      0.5
    );
  });
  it('approximates 1 deg lat ≈ 111 km', () => {
    const d = distanceMeters({ lat: 47, lng: 16 }, { lat: 48, lng: 16 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });
});

// Ein Dokument je Gerät: derselbe Account auf Tablet und Desktop schrieb
// vorher dasselbe Dokument `livelocation/{uid}` und die Geräte überschrieben
// sich gegenseitig (Nachtrag zu #760).
describe('useLiveLocationShare document identity', () => {
  const identity = {
    firecallId: 'fc-A',
    uid: 'uid-1',
    deviceId: 'devaaaaaaaaa',
    deviceLabel: 'Windows',
    name: 'Paul Wölfel',
    email: 'paul@example.com',
  };
  const pos = { lat: 47.9, lng: 16.85 };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes to livelocation/{uid}_{deviceId}', async () => {
    const { result } = renderHook(() => useLiveLocationShare(identity, settings));
    await result.current.maybeSend(pos, undefined);

    expect(setDocMock).toHaveBeenCalledTimes(1);
    const ref = setDocMock.mock.calls[0][0] as unknown as { path: string };
    expect(ref.path).toBe('call/fc-A/livelocation/uid-1_devaaaaaaaaa');
  });

  it('carries deviceId and deviceLabel in the payload', async () => {
    const { result } = renderHook(() => useLiveLocationShare(identity, settings));
    await result.current.maybeSend(pos, undefined);

    const payload = setDocMock.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.uid).toBe('uid-1');
    expect(payload.deviceId).toBe('devaaaaaaaaa');
    expect(payload.deviceLabel).toBe('Windows');
  });

  // Beim ersten Schreiben nach dem Update liegt noch das Altdokument unter der
  // bloßen uid. Ohne Aufräumen stünde der eigene Pin bis zum TTL-Ablauf (1 h)
  // doppelt auf den Karten der anderen.
  it('removes the legacy per-user document on the first write', async () => {
    const { result } = renderHook(() => useLiveLocationShare(identity, settings));
    await result.current.maybeSend(pos, undefined);

    const deleted = deleteDocMock.mock.calls.map(
      (c) => (c[0] as unknown as { path: string }).path,
    );
    expect(deleted).toContain('call/fc-A/livelocation/uid-1');
  });

  it('deletes both the device document and the legacy one on deleteOwn', async () => {
    const { result } = renderHook(() => useLiveLocationShare(identity, settings));
    await result.current.deleteOwn();

    const deleted = deleteDocMock.mock.calls.map(
      (c) => (c[0] as unknown as { path: string }).path,
    );
    expect(deleted).toContain('call/fc-A/livelocation/uid-1_devaaaaaaaaa');
    expect(deleted).toContain('call/fc-A/livelocation/uid-1');
  });

  it('writes nothing without an identity', async () => {
    const { result } = renderHook(() => useLiveLocationShare(null, settings));
    await result.current.maybeSend(pos, undefined);
    expect(setDocMock).not.toHaveBeenCalled();
  });
});
