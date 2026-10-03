// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  onSnapshot: vi.fn(),
  unsubscribe: vi.fn(),
  hasFirebaseUser: true,
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...segments: string[]) => ({
    path: segments.join('/'),
  })),
  onSnapshot: hoisted.onSnapshot,
}));
vi.mock('../components/firebase/firebase', () => ({ firestore: {} }));
vi.mock('./useFirebaseLogin', () => ({
  default: () => ({ hasFirebaseUser: hoisted.hasFirebaseUser }),
}));

import usePendingDocIds from './usePendingDocIds';

type Listener = (snapshot: unknown) => void;

function snapshot(docs: { id: string; pending: boolean }[]) {
  return {
    docs: docs.map((d) => ({ id: d.id, metadata: { hasPendingWrites: d.pending } })),
  };
}

describe('usePendingDocIds', () => {
  let listener: Listener | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.hasFirebaseUser = true;
    listener = undefined;
    hoisted.onSnapshot.mockImplementation(
      (_ref: unknown, _options: unknown, next: Listener) => {
        listener = next;
        return hoisted.unsubscribe;
      },
    );
  });

  it('listens with metadata changes and reports documents with pending writes', () => {
    const { result } = renderHook(() =>
      usePendingDocIds(['call', 'fc-1', 'item']),
    );

    expect(hoisted.onSnapshot).toHaveBeenCalledWith(
      { path: 'call/fc-1/item' },
      { includeMetadataChanges: true },
      expect.any(Function),
      expect.any(Function),
    );

    act(() =>
      listener?.(
        snapshot([
          { id: 'a', pending: true },
          { id: 'b', pending: false },
        ]),
      ),
    );
    expect([...result.current]).toEqual(['a']);

    act(() => listener?.(snapshot([{ id: 'a', pending: false }])));
    expect(result.current.size).toBe(0);
  });

  it('keeps the same set while nothing changes', () => {
    const { result } = renderHook(() =>
      usePendingDocIds(['call', 'fc-1', 'item']),
    );
    act(() => listener?.(snapshot([{ id: 'a', pending: true }])));
    const first = result.current;
    act(() => listener?.(snapshot([{ id: 'a', pending: true }])));
    expect(result.current).toBe(first);
  });

  it('does not listen without a path, for an unknown firecall or without a user', () => {
    renderHook(() => usePendingDocIds(null));
    renderHook(() => usePendingDocIds(['call', 'unknown', 'item']));
    hoisted.hasFirebaseUser = false;
    renderHook(() => usePendingDocIds(['call', 'fc-1', 'item']));
    expect(hoisted.onSnapshot).not.toHaveBeenCalled();
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() =>
      usePendingDocIds(['call', 'fc-1', 'item']),
    );
    unmount();
    expect(hoisted.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
