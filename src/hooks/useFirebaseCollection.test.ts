// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useFirestoreQueryMock, useFirebaseLoginMock, collectionMock, queryMock } =
  vi.hoisted(() => ({
    useFirestoreQueryMock: vi.fn(),
    useFirebaseLoginMock: vi.fn(),
    collectionMock: vi.fn(() => ({ __collection: true })),
    queryMock: vi.fn(() => ({ __query: true })),
  }));

vi.mock('./useFirestoreQuery', () => ({
  useFirestoreQuery: useFirestoreQueryMock,
}));

vi.mock('./useFirebaseLogin', () => ({ default: useFirebaseLoginMock }));

vi.mock('firebase/firestore', () => ({
  collection: collectionMock,
  query: queryMock,
}));

vi.mock('../components/firebase/firebase', () => ({
  firestore: { __firestore: true },
}));

const useFirebaseCollection = (await import('./useFirebaseCollection')).default;

/** Die Query, mit der useFirestoreQuery aufgerufen wurde. */
function passedQuery() {
  return useFirestoreQueryMock.mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  useFirestoreQueryMock.mockReturnValue({
    value: undefined,
    loading: false,
    error: undefined,
    records: [],
  });
  useFirebaseLoginMock.mockReturnValue({ hasFirebaseUser: true });
});

describe('useFirebaseCollection', () => {
  it('subscribes when a firebase user is present', () => {
    renderHook(() => useFirebaseCollection({ collectionName: 'hydrant' }));
    expect(passedQuery()).not.toBeNull();
  });

  it('does not subscribe while there is no firebase user', () => {
    // Der Auth-Cache lässt isAuthorized beim ersten Render true sein, obwohl
    // Firebase noch keinen User hat. Ein Listener würde dann mit
    // permission-denied scheitern, weil request.auth null ist.
    useFirebaseLoginMock.mockReturnValue({ hasFirebaseUser: false });
    renderHook(() => useFirebaseCollection({ collectionName: 'hydrant' }));
    expect(passedQuery()).toBeNull();
  });

  it('subscribes once the firebase user appears', () => {
    useFirebaseLoginMock.mockReturnValue({ hasFirebaseUser: false });
    const { rerender } = renderHook(() =>
      useFirebaseCollection({ collectionName: 'hydrant' }),
    );
    expect(passedQuery()).toBeNull();

    useFirebaseLoginMock.mockReturnValue({ hasFirebaseUser: true });
    rerender();
    expect(passedQuery()).not.toBeNull();
  });

  it('still returns null for an unresolved firecall path', () => {
    renderHook(() =>
      useFirebaseCollection({
        collectionName: 'call',
        pathSegments: ['unknown', 'layer'],
      }),
    );
    expect(passedQuery()).toBeNull();
  });
});
