import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
  withFreshAuth: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  setDoc: hoisted.setDoc,
  updateDoc: hoisted.updateDoc,
  addDoc: hoisted.addDoc,
  deleteDoc: hoisted.deleteDoc,
  doc: vi.fn(),
  collection: vi.fn(),
  writeBatch: hoisted.writeBatch,
}));

vi.mock('../hooks/auth/withFreshAuth', () => ({
  withFreshAuth: hoisted.withFreshAuth,
}));

import {
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  commitBatch,
  commitInBatches,
} from './firestoreClient';

describe('firestoreClient', () => {
  beforeEach(() => {
    hoisted.setDoc.mockReset();
    hoisted.updateDoc.mockReset();
    hoisted.addDoc.mockReset();
    hoisted.deleteDoc.mockReset();
    hoisted.withFreshAuth.mockReset();
    hoisted.withFreshAuth.mockImplementation((op) => op());
    hoisted.writeBatch.mockReset();
  });

  it('setDoc routes through withFreshAuth (2-arg form)', async () => {
    hoisted.setDoc.mockResolvedValue(undefined);
    await setDoc('ref' as never, { a: 1 } as never);
    expect(hoisted.withFreshAuth).toHaveBeenCalledTimes(1);
    expect(hoisted.setDoc).toHaveBeenCalledWith('ref', { a: 1 });
  });

  it('setDoc passes options when provided (3-arg form)', async () => {
    hoisted.setDoc.mockResolvedValue(undefined);
    await setDoc('ref' as never, { a: 1 } as never, { merge: true });
    expect(hoisted.setDoc).toHaveBeenCalledWith('ref', { a: 1 }, { merge: true });
  });

  it('updateDoc routes through withFreshAuth', async () => {
    hoisted.updateDoc.mockResolvedValue(undefined);
    await updateDoc('ref' as never, { a: 1 } as never);
    expect(hoisted.withFreshAuth).toHaveBeenCalledTimes(1);
    expect(hoisted.updateDoc).toHaveBeenCalledWith('ref', { a: 1 });
  });

  it('addDoc routes through withFreshAuth and returns its result', async () => {
    hoisted.addDoc.mockResolvedValue({ id: 'generated' });
    const result = await addDoc('coll' as never, { a: 1 } as never);
    expect(hoisted.withFreshAuth).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: 'generated' });
  });

  it('deleteDoc routes through withFreshAuth', async () => {
    hoisted.deleteDoc.mockResolvedValue(undefined);
    await deleteDoc('ref' as never);
    expect(hoisted.withFreshAuth).toHaveBeenCalledTimes(1);
    expect(hoisted.deleteDoc).toHaveBeenCalledWith('ref');
  });

  it('commitBatch wraps batch.commit() in withFreshAuth', async () => {
    const batch = { commit: vi.fn().mockResolvedValue(undefined) } as unknown as Parameters<
      typeof commitBatch
    >[0];
    await commitBatch(batch);
    expect(hoisted.withFreshAuth).toHaveBeenCalledTimes(1);
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });

  describe('commitInBatches', () => {
    function collectBatches() {
      const batches: { set: ReturnType<typeof vi.fn>; commit: ReturnType<typeof vi.fn> }[] = [];
      hoisted.writeBatch.mockImplementation(() => {
        const batch = {
          set: vi.fn(),
          commit: vi.fn().mockResolvedValue(undefined),
        };
        batches.push(batch);
        return batch;
      });
      return batches;
    }

    it('writes everything in a single batch below the limit', async () => {
      const batches = collectBatches();
      const operations = Array.from({ length: 10 }, (_, i) => ({
        ref: `ref-${i}` as never,
        data: { i },
      }));

      await commitInBatches('firestore' as never, operations);

      expect(batches).toHaveLength(1);
      expect(batches[0].set).toHaveBeenCalledTimes(10);
      expect(batches[0].commit).toHaveBeenCalledTimes(1);
    });

    it('splits above the 500 operation limit of a writeBatch', async () => {
      const batches = collectBatches();
      const operations = Array.from({ length: 1000 }, (_, i) => ({
        ref: `ref-${i}` as never,
        data: { i },
      }));

      await commitInBatches('firestore' as never, operations);

      expect(batches).toHaveLength(3);
      expect(batches[0].set).toHaveBeenCalledTimes(499);
      expect(batches[1].set).toHaveBeenCalledTimes(499);
      expect(batches[2].set).toHaveBeenCalledTimes(2);
      // every chunk goes through withFreshAuth on its own
      expect(hoisted.withFreshAuth).toHaveBeenCalledTimes(3);
    });

    it('does nothing without operations', async () => {
      const batches = collectBatches();

      await commitInBatches('firestore' as never, []);

      expect(batches).toHaveLength(0);
    });
  });
});
