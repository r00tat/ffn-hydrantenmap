import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({}));
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
  signOut: vi.fn(),
}));
vi.mock('../../components/firebase/firebase', () => ({
  default: {},
  firestore: {},
}));

import { shouldCreateSnapshot } from './useAutoSnapshot';

describe('shouldCreateSnapshot', () => {
  const now = new Date('2026-04-03T12:10:00Z').getTime();

  it('returns false when no changes detected', () => {
    expect(
      shouldCreateSnapshot({
        changesDetected: false,
        lastSnapshotTime: new Date('2026-04-03T12:00:00Z').toISOString(),
        intervalMinutes: 5,
        now,
      })
    ).toBe(false);
  });

  it('returns false when interval has not elapsed', () => {
    expect(
      shouldCreateSnapshot({
        changesDetected: true,
        lastSnapshotTime: new Date('2026-04-03T12:08:00Z').toISOString(),
        intervalMinutes: 5,
        now,
      })
    ).toBe(false);
  });

  it('returns true when changes detected and interval elapsed', () => {
    expect(
      shouldCreateSnapshot({
        changesDetected: true,
        lastSnapshotTime: new Date('2026-04-03T12:04:00Z').toISOString(),
        intervalMinutes: 5,
        now,
      })
    ).toBe(true);
  });

  it('returns true when changes detected and no previous snapshot exists', () => {
    expect(
      shouldCreateSnapshot({
        changesDetected: true,
        lastSnapshotTime: undefined,
        intervalMinutes: 5,
        now,
      })
    ).toBe(true);
  });

  it('returns false when interval is 0 (disabled)', () => {
    expect(
      shouldCreateSnapshot({
        changesDetected: true,
        lastSnapshotTime: new Date('2026-04-03T12:00:00Z').toISOString(),
        intervalMinutes: 0,
        now,
      })
    ).toBe(false);
  });
});
