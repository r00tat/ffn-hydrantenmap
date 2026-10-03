// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  login: {
    isAuthorized: true,
    hasFirebaseUser: true,
    groups: ['g1'] as string[],
  },
  connectivity: { status: 'online' as string },
  firecall: {
    id: 'fc1',
    name: '',
    group: 'g1',
    lat: 47.9,
    lng: 16.8,
  } as Record<string, unknown>,
  warmFirecall: vi.fn(),
  warmGroup: vi.fn(),
}));

vi.mock('./useFirebaseLogin', () => ({ default: () => mocks.login }));
vi.mock('./useConnectivity', () => ({ default: () => mocks.connectivity }));
vi.mock('./useFirecall', () => ({ useFirecall: () => mocks.firecall }));
vi.mock('../components/firebase/firebase', () => ({ firestore: {} }));
vi.mock('../components/firebase/clusterQuery', () => ({
  queryClusters: vi.fn(),
}));
vi.mock('../lib/firestoreWarmup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/firestoreWarmup')>()),
  warmFirecallCache: (id: string) => mocks.warmFirecall(id),
  warmGroupCache: (options: unknown) => mocks.warmGroup(options),
}));

import { resetWarmupForTests } from '../lib/firestoreWarmup';
import useFirestoreWarmup, {
  FIRESTORE_WARMUP_DELAY_MS,
} from './useFirestoreWarmup';

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FIRESTORE_WARMUP_DELAY_MS);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  resetWarmupForTests();
  mocks.login = { isAuthorized: true, hasFirebaseUser: true, groups: ['g1'] };
  mocks.connectivity = { status: 'online' };
  mocks.firecall = { id: 'fc1', name: '', group: 'g1', lat: 47.9, lng: 16.8 };
  mocks.warmFirecall.mockReset().mockResolvedValue({ ok: ['x'], failed: [] });
  mocks.warmGroup.mockReset().mockResolvedValue({ ok: ['x'], failed: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useFirestoreWarmup', () => {
  it('wärmt Einsatz und Gruppendaten nach kurzer Wartezeit vor', async () => {
    renderHook(() => useFirestoreWarmup());
    expect(mocks.warmFirecall).not.toHaveBeenCalled();
    await flush();
    expect(mocks.warmFirecall).toHaveBeenCalledWith('fc1');
    expect(mocks.warmGroup).toHaveBeenCalledWith({
      groupId: 'g1',
      groups: ['g1'],
      center: { lat: 47.9, lng: 16.8 },
    });
  });

  it('wärmt je Einsatz nur einmal vor, auch bei mehreren Aufrufern', async () => {
    const { rerender } = renderHook(() => useFirestoreWarmup());
    renderHook(() => useFirestoreWarmup());
    await flush();
    rerender();
    await flush();
    expect(mocks.warmFirecall).toHaveBeenCalledTimes(1);
    expect(mocks.warmGroup).toHaveBeenCalledTimes(1);
  });

  it('wärmt offline nicht vor', async () => {
    mocks.connectivity = { status: 'offline' };
    renderHook(() => useFirestoreWarmup());
    await flush();
    expect(mocks.warmFirecall).not.toHaveBeenCalled();
    expect(mocks.warmGroup).not.toHaveBeenCalled();
  });

  it('ohne Einsatz nur die Einsatzliste der Gruppen', async () => {
    mocks.firecall = { id: 'unknown', name: '' };
    renderHook(() => useFirestoreWarmup());
    await flush();
    expect(mocks.warmFirecall).not.toHaveBeenCalled();
    expect(mocks.warmGroup).toHaveBeenCalledWith({
      groupId: undefined,
      groups: ['g1'],
      center: undefined,
    });
  });

  it('ohne Anmeldung passiert nichts', async () => {
    mocks.login = { isAuthorized: false, hasFirebaseUser: false, groups: [] };
    renderHook(() => useFirestoreWarmup());
    await flush();
    expect(mocks.warmFirecall).not.toHaveBeenCalled();
    expect(mocks.warmGroup).not.toHaveBeenCalled();
  });
});
