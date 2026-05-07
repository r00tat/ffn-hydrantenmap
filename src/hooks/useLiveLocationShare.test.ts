import { describe, it, expect, vi } from 'vitest';

vi.mock('../components/firebase/firebase', () => ({
  default: {},
  firestore: { type: 'mock-firestore' },
}));

vi.mock('../lib/firestoreClient', () => ({
  setDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
}));

import { shouldSendUpdate, distanceMeters } from './useLiveLocationShare';

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
