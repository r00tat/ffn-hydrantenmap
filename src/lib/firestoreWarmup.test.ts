import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  queryClusters: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  query: (ref: { path: string }, ...constraints: unknown[]) => ({
    path: ref.path,
    constraints,
  }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  orderBy: (field: string, dir?: string) => ({ orderBy: field, dir }),
  getDocs: hoisted.getDocs,
  getDoc: hoisted.getDoc,
}));

vi.mock('../components/firebase/firebase', () => ({ firestore: {} }));
vi.mock('../components/firebase/clusterQuery', () => ({
  queryClusters: hoisted.queryClusters,
}));

import {
  firecallWarmupPaths,
  resetWarmupForTests,
  warmFirecallCache,
  warmGroupCache,
  warmOnce,
  WARMUP_FIRECALL_LIST_DAYS,
} from './firestoreWarmup';

describe('firestoreWarmup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetWarmupForTests();
    hoisted.getDocs.mockResolvedValue({ size: 0 });
    hoisted.getDoc.mockResolvedValue({ exists: () => true });
    hoisted.queryClusters.mockResolvedValue([]);
  });

  it('nennt alle Untersammlungen eines Einsatzes', () => {
    expect(firecallWarmupPaths('fc1')).toEqual([
      'call/fc1/item',
      'call/fc1/layer',
      'call/fc1/crew',
      'call/fc1/location',
      'call/fc1/mapLayer',
      'call/fc1/atemschutzTrupp',
      'call/fc1/atemschutzAusgabe',
    ]);
  });

  it('lädt Einsatz-Dokument und Untersammlungen einmal vom Server', async () => {
    const result = await warmFirecallCache('fc1');
    expect(hoisted.getDoc).toHaveBeenCalledWith({ path: 'call/fc1' });
    const paths = hoisted.getDocs.mock.calls.map((c) => c[0].path);
    expect(paths).toEqual(firecallWarmupPaths('fc1'));
    expect(result.failed).toEqual([]);
    expect(result.ok).toHaveLength(8);
  });

  it('eine verweigerte Sammlung bricht das Vorwärmen nicht ab', async () => {
    hoisted.getDocs.mockImplementation(async (q: { path: string }) => {
      if (q.path.endsWith('crew')) throw new Error('permission-denied');
      return { size: 1 };
    });
    const result = await warmFirecallCache('fc1');
    expect(result.failed).toEqual(['call/fc1/crew']);
    expect(result.ok).toContain('call/fc1/item');
  });

  it('wärmt Gruppendaten, Einsatzliste und Hydranten-Cluster vor', async () => {
    const now = new Date('2026-10-03T12:00:00Z');
    const result = await warmGroupCache({
      groupId: 'g1',
      groups: ['g1', 'g2'],
      center: { lat: 47.9, lng: 16.8 },
      now,
    });

    const calls = hoisted.getDocs.mock.calls.map((c) => c[0]);
    const paths = calls.map((q) => q.path);
    expect(paths).toContain('groups/g1/atemschutzGeraet');
    expect(paths).toContain('groups/g1/vehicle');
    expect(paths).toContain('groups/g1/person');
    // Eigene Flotte für die Besatzungsgruppen (useOwnFleet).
    expect(paths).toContain('kostenersatzVehicles');

    const list = calls.find((q) => q.path === 'call');
    const cutoff = new Date(
      now.getTime() - WARMUP_FIRECALL_LIST_DAYS * 86_400_000,
    ).toISOString();
    expect(list.constraints).toEqual(
      expect.arrayContaining([
        { field: 'deleted', op: '==', value: false },
        { field: 'group', op: 'in', value: ['g1', 'g2'] },
        { field: 'date', op: '>=', value: cutoff },
      ]),
    );

    const docs = hoisted.getDoc.mock.calls.map((c) => c[0].path);
    expect(docs).toContain('groups/g1/groupConfig/stammdaten');
    expect(hoisted.queryClusters).toHaveBeenCalledWith(
      { lat: 47.9, lng: 16.8 },
      expect.any(Number),
    );
    expect(result.failed).toEqual([]);
  });

  it('teilt die Gruppenliste in Abfragen zu höchstens 30 Gruppen', async () => {
    const groups = Array.from({ length: 31 }, (_, i) => `g${i}`);
    await warmGroupCache({ groups });
    const lists = hoisted.getDocs.mock.calls
      .map((c) => c[0])
      .filter((q) => q.path === 'call');
    expect(lists).toHaveLength(2);
  });

  it('ohne Gruppe und Standort fragt es nichts Gruppenbezogenes ab', async () => {
    await warmGroupCache({ groups: [] });
    expect(hoisted.getDocs).not.toHaveBeenCalled();
    expect(hoisted.getDoc).not.toHaveBeenCalled();
    expect(hoisted.queryClusters).not.toHaveBeenCalled();
  });

  describe('warmOnce', () => {
    it('führt denselben Schlüssel nur einmal aus', async () => {
      const fn = vi.fn().mockResolvedValue({ ok: ['a'], failed: [] });
      await Promise.all([warmOnce('k', fn), warmOnce('k', fn)]);
      await warmOnce('k', fn);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('versucht es erneut, wenn alles scheiterte', async () => {
      const fn = vi
        .fn()
        .mockResolvedValueOnce({ ok: [], failed: ['a'] })
        .mockResolvedValueOnce({ ok: ['a'], failed: [] });
      await warmOnce('k', fn);
      await warmOnce('k', fn);
      await warmOnce('k', fn);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('versucht es erneut nach einer Ausnahme', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({ ok: ['a'], failed: [] });
      await warmOnce('k', fn);
      await warmOnce('k', fn);
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });
});
