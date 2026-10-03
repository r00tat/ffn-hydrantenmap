import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
  withFreshAuth: vi.fn(),
  writeBatch: vi.fn(),
  doc: vi.fn(),
  ensureFreshAuth: vi.fn(),
  isOffline: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  setDoc: hoisted.setDoc,
  updateDoc: hoisted.updateDoc,
  addDoc: hoisted.addDoc,
  deleteDoc: hoisted.deleteDoc,
  doc: hoisted.doc,
  collection: vi.fn(),
  writeBatch: hoisted.writeBatch,
}));

vi.mock('../hooks/auth/ensureFreshAuth', async () => {
  const actual = await vi.importActual<
    typeof import('../hooks/auth/ensureFreshAuth')
  >('../hooks/auth/ensureFreshAuth');
  return {
    isAuthError: actual.isAuthError,
    ensureFreshAuth: hoisted.ensureFreshAuth,
  };
});

vi.mock('../components/firebase/firebase', () => ({ auth: {}, firestore: {} }));
vi.mock('../app/firebaseAuth', () => ({ firebaseTokenLogin: vi.fn() }));

vi.mock('./connectivity', () => ({
  isOffline: hoisted.isOffline,
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
  addDocLocal,
  setDocLocal,
  updateDocLocal,
  deleteDocLocal,
  commitBatchLocal,
  commitInBatchesLocal,
} from './firestoreClient';
import { clearSyncErrors, getSyncErrors } from './syncErrors';
import { getPendingWriteCount } from './pendingWrites';

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

describe('firestoreClient local writes', () => {
  const never = () => new Promise<never>(() => {});
  const flush = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };
  const permissionDenied = () =>
    Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'permission-denied',
    });

  beforeEach(() => {
    hoisted.setDoc.mockReset();
    hoisted.updateDoc.mockReset();
    hoisted.deleteDoc.mockReset();
    hoisted.withFreshAuth.mockReset();
    hoisted.ensureFreshAuth.mockReset();
    hoisted.ensureFreshAuth.mockResolvedValue(true);
    hoisted.isOffline.mockReset();
    hoisted.isOffline.mockReturnValue(false);
    hoisted.doc.mockReset();
    hoisted.doc.mockImplementation(() => ({ id: 'local-id', path: 'coll/local-id' }));
    clearSyncErrors();
  });

  it('addDocLocal returns the device-generated ref synchronously even if the server never confirms', () => {
    hoisted.setDoc.mockImplementation(never);
    const ref = addDocLocal({ path: 'coll' } as never, { a: 1 } as never);
    expect(ref).toEqual({ id: 'local-id', path: 'coll/local-id' });
    expect(hoisted.setDoc).toHaveBeenCalledWith(
      { id: 'local-id', path: 'coll/local-id' },
      { a: 1 },
    );
  });

  it('issues the SDK call immediately without waiting for a token refresh', () => {
    hoisted.setDoc.mockImplementation(never);
    hoisted.updateDoc.mockImplementation(never);
    hoisted.deleteDoc.mockImplementation(never);
    // An auth refresh that hangs (offline) must not hold back the write.
    hoisted.ensureFreshAuth.mockImplementation(never);

    setDocLocal({ path: 'a/1' } as never, { a: 1 } as never, { merge: true });
    updateDocLocal({ path: 'a/2' } as never, { a: 2 } as never);
    deleteDocLocal({ path: 'a/3' } as never);

    expect(hoisted.setDoc).toHaveBeenCalledWith({ path: 'a/1' }, { a: 1 }, { merge: true });
    expect(hoisted.updateDoc).toHaveBeenCalledWith({ path: 'a/2' }, { a: 2 });
    expect(hoisted.deleteDoc).toHaveBeenCalledWith({ path: 'a/3' });
    expect(hoisted.withFreshAuth).not.toHaveBeenCalled();
    expect(hoisted.ensureFreshAuth).not.toHaveBeenCalled();
  });

  it('counts the unconfirmed write as pending', async () => {
    let resolve!: () => void;
    hoisted.updateDoc.mockImplementation(
      () => new Promise<void>((r) => (resolve = r)),
    );
    const before = getPendingWriteCount();
    updateDocLocal({ path: 'a/1' } as never, { a: 1 } as never);
    expect(getPendingWriteCount()).toBe(before + 1);
    resolve();
    await flush();
    expect(getPendingWriteCount()).toBe(before);
  });

  it('commitBatchLocal commits right away', () => {
    const batch = { commit: vi.fn(never) };
    commitBatchLocal(batch as never, 'Import');
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });

  it('does not offer a retry for a batch, which can only be committed once', async () => {
    const batch = { commit: vi.fn().mockRejectedValue(permissionDenied()) };
    commitBatchLocal(batch as never, 'Import');
    await flush();
    expect(batch.commit).toHaveBeenCalledTimes(1);
    expect(getSyncErrors()[0]).toMatchObject({
      kind: 'batch',
      path: 'Import',
      canRetry: false,
    });
  });

  it('commitInBatchesLocal splits and commits every chunk without waiting', () => {
    const batches: { set: ReturnType<typeof vi.fn>; commit: ReturnType<typeof vi.fn> }[] = [];
    hoisted.writeBatch.mockImplementation(() => {
      const batch = { set: vi.fn(), commit: vi.fn(never) };
      batches.push(batch);
      return batch;
    });
    commitInBatchesLocal(
      'firestore' as never,
      Array.from({ length: 600 }, (_, i) => ({ ref: `r${i}` as never, data: { i } })),
      'Verlauf',
    );
    expect(batches).toHaveLength(2);
    expect(batches[0].set).toHaveBeenCalledTimes(499);
    expect(batches[1].commit).toHaveBeenCalledTimes(1);
  });

  it('records a rejected write in the sync error list', async () => {
    hoisted.updateDoc.mockRejectedValue(
      Object.assign(new Error('invalid'), { code: 'invalid-argument' }),
    );
    updateDocLocal({ path: 'call/1/item/2' } as never, { a: 1 } as never);
    await flush();
    const errors = getSyncErrors();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      kind: 'update',
      path: 'call/1/item/2',
      code: 'invalid-argument',
      canRetry: true,
    });
  });

  it('retries once after a forced auth refresh when online', async () => {
    hoisted.setDoc
      .mockRejectedValueOnce(permissionDenied())
      .mockResolvedValueOnce(undefined);
    setDocLocal({ path: 'a/1' } as never, { a: 1 } as never);
    await flush();
    expect(hoisted.ensureFreshAuth).toHaveBeenCalledWith(true);
    expect(hoisted.setDoc).toHaveBeenCalledTimes(2);
    expect(getSyncErrors()).toHaveLength(0);
  });

  it('does not try to refresh auth while offline', async () => {
    hoisted.isOffline.mockReturnValue(true);
    hoisted.setDoc.mockRejectedValue(permissionDenied());
    setDocLocal({ path: 'a/1' } as never, { a: 1 } as never);
    await flush();
    expect(hoisted.ensureFreshAuth).not.toHaveBeenCalled();
    expect(hoisted.setDoc).toHaveBeenCalledTimes(1);
    expect(getSyncErrors()).toHaveLength(1);
    expect(getSyncErrors()[0].code).toBe('permission-denied');
  });

  it('records the error when the retry is rejected as well', async () => {
    hoisted.deleteDoc.mockRejectedValue(permissionDenied());
    deleteDocLocal({ path: 'a/1' } as never);
    await flush();
    expect(hoisted.deleteDoc).toHaveBeenCalledTimes(2);
    expect(getSyncErrors()).toHaveLength(1);
  });

  it('propagates synchronous validation errors to the caller', () => {
    hoisted.setDoc.mockImplementation(() => {
      throw new Error('Unsupported field value: undefined');
    });
    expect(() => setDocLocal({ path: 'a/1' } as never, { a: undefined } as never)).toThrow(
      /Unsupported field value/,
    );
  });
});
