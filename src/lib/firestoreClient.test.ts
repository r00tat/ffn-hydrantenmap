import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
  withFreshAuth: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  setDoc: hoisted.setDoc,
  updateDoc: hoisted.updateDoc,
  addDoc: hoisted.addDoc,
  deleteDoc: hoisted.deleteDoc,
  doc: vi.fn(),
  collection: vi.fn(),
  writeBatch: vi.fn(),
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
} from './firestoreClient';

describe('firestoreClient', () => {
  beforeEach(() => {
    hoisted.setDoc.mockReset();
    hoisted.updateDoc.mockReset();
    hoisted.addDoc.mockReset();
    hoisted.deleteDoc.mockReset();
    hoisted.withFreshAuth.mockReset();
    hoisted.withFreshAuth.mockImplementation((op) => op());
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
});
