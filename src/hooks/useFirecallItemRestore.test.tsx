// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  setDocLocal: vi.fn(),
  commitBatchLocal: vi.fn(),
  getDocs: vi.fn(),
  getDocFromCache: vi.fn(),
  logChange: vi.fn(),
  batch: {
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

const pathOf = (...args: unknown[]) =>
  args.filter((a) => typeof a === 'string').join('/');

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((...args: unknown[]) => ({ path: pathOf(...args) })),
  doc: vi.fn((...args: unknown[]) => ({ path: pathOf(...args) })),
  query: vi.fn((col: unknown) => col),
  where: vi.fn(),
  getDocs: hoisted.getDocs,
  getDocFromCache: hoisted.getDocFromCache,
  writeBatch: () => hoisted.batch,
  deleteField: () => 'DELETE_FIELD',
}));
vi.mock('../lib/firestoreClient', () => ({
  setDocLocal: hoisted.setDocLocal,
  commitBatchLocal: hoisted.commitBatchLocal,
}));
vi.mock('../components/firebase/firebase', () => ({ firestore: {} }));
vi.mock('./useFirebaseLogin', () => ({
  default: () => ({ email: 'muster@example.com' }),
}));
vi.mock('./useFirecall', () => ({ useFirecallId: () => 'fc1' }));
vi.mock('./useAuditLog', () => ({ useAuditLog: () => hoisted.logChange }));
vi.mock('../components/FirecallItems/elements', () => ({
  getItemClass: (type: string) => ({
    firebaseCollectionName: () => (type === 'layer' ? 'layer' : 'item'),
  }),
}));

import useFirecallItemRestore from './useFirecallItemRestore';

function snapshotDocs(docs: { id: string; data: Record<string, unknown> }[]) {
  return {
    docs: docs.map((d) => ({
      id: d.id,
      ref: { path: d.id },
      data: () => d.data,
    })),
  };
}

describe('useFirecallItemRestore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getDocFromCache.mockRejectedValue(new Error('not cached'));
    hoisted.getDocs.mockResolvedValue(snapshotDocs([]));
  });

  it('holt ein gelöschtes Element zurück und protokolliert restore', async () => {
    const { result } = renderHook(() => useFirecallItemRestore());

    await result.current({
      id: 'm1',
      type: 'marker',
      name: 'Marker',
      deleted: true,
    } as never);

    expect(hoisted.setDocLocal).toHaveBeenCalledWith(
      { path: 'call/fc1/item/m1' },
      expect.objectContaining({ name: 'Marker', deleted: false }),
      { merge: false }
    );
    expect(hoisted.logChange).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'restore', elementId: 'm1' })
    );
  });

  it('führt den Vorzustand aus dem Audit-Log mit dem Dokument zusammen', async () => {
    const { result } = renderHook(() => useFirecallItemRestore());

    await result.current(
      { id: 'm1', type: 'marker', lat: 47.9, lng: 16.8 } as never,
      { merge: true }
    );

    expect(hoisted.setDocLocal).toHaveBeenCalledWith(
      { path: 'call/fc1/item/m1' },
      expect.objectContaining({ lat: 47.9, lng: 16.8, deleted: false }),
      { merge: true }
    );
  });

  it('bringt mit einer Ebene nur die mit ihr gelöschten Elemente zurück', async () => {
    hoisted.getDocs.mockResolvedValue(
      snapshotDocs([
        {
          id: 'a',
          data: { type: 'marker', layer: 'l1', deleted: true, deletedWithLayer: 'l1' },
        },
        { id: 'b', data: { type: 'marker', layer: 'l1', deleted: true } },
        { id: 'c', data: { type: 'marker', layer: 'l1' } },
      ])
    );
    const { result } = renderHook(() => useFirecallItemRestore());

    await result.current({
      id: 'l1',
      type: 'layer',
      name: 'Ebene',
      deleted: true,
    } as never);

    expect(hoisted.setDocLocal).toHaveBeenCalledWith(
      { path: 'call/fc1/layer/l1' },
      expect.objectContaining({ deleted: false }),
      { merge: false }
    );
    expect(hoisted.batch.update).toHaveBeenCalledTimes(1);
    expect(hoisted.batch.update).toHaveBeenCalledWith(
      { path: 'a' },
      expect.objectContaining({ deleted: false, deletedWithLayer: 'DELETE_FIELD' })
    );
    expect(hoisted.logChange).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'restore', elementId: 'a' })
    );
  });

  it('ersetzt die Striche einer Zeichnung durch die aus dem Verlauf', async () => {
    hoisted.getDocs.mockImplementation((col: { path: string }) => {
      if (col.path === 'call/fc1/history/h1/item/d1/stroke') {
        return Promise.resolve(
          snapshotDocs([{ id: 's1', data: { points: [1, 2], order: 0 } }])
        );
      }
      if (col.path === 'call/fc1/item/d1/stroke') {
        return Promise.resolve(
          snapshotDocs([
            { id: 's1', data: { points: [9, 9], order: 0 } },
            { id: 's2', data: { points: [3, 4], order: 1 } },
          ])
        );
      }
      return Promise.resolve(snapshotDocs([]));
    });
    const { result } = renderHook(() => useFirecallItemRestore());

    await result.current(
      { id: 'd1', type: 'drawing', name: 'Skizze' } as never,
      { historyId: 'h1' }
    );

    expect(hoisted.batch.delete).toHaveBeenCalledWith({ path: 's2' });
    expect(hoisted.batch.set).toHaveBeenCalledWith(
      { path: 'call/fc1/item/d1/stroke/s1' },
      { points: [1, 2], order: 0 }
    );
  });
});
