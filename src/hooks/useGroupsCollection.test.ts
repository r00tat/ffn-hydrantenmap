// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (snapshot: unknown) => void;

const { listeners, unsubscribes, useFirebaseLoginMock } = vi.hoisted(() => ({
  listeners: new Map<string, Listener>(),
  unsubscribes: new Map<string, ReturnType<typeof vi.fn>>(),
  useFirebaseLoginMock: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  query: (coll: { path: string }) => coll,
  onSnapshot: (q: { path: string }, next: Listener) => {
    listeners.set(q.path, next);
    const unsubscribe = vi.fn();
    unsubscribes.set(q.path, unsubscribe);
    return unsubscribe;
  },
}));

vi.mock('../components/firebase/firebase', () => ({ firestore: {} }));

vi.mock('../lib/snapshotRetry', () => ({
  subscribeRetryingAfterPendingWrites: (
    _db: unknown,
    subscribe: (onError: () => void) => () => void,
  ) => subscribe(() => {}),
}));

vi.mock('./useFirebaseLogin', () => ({ default: useFirebaseLoginMock }));

const useGroupsCollection = (await import('./useGroupsCollection')).default;

function emit(path: string, docs: Array<{ id: string; [k: string]: unknown }>) {
  act(() => {
    listeners.get(path)?.({
      docs: docs.map(({ id, ...data }) => ({ id, data: () => data })),
    });
  });
}

beforeEach(() => {
  listeners.clear();
  unsubscribes.clear();
  useFirebaseLoginMock.mockReturnValue({ hasFirebaseUser: true });
});

describe('useGroupsCollection', () => {
  it('abonniert die Untersammlung jeder Gruppe und markiert die Herkunft', () => {
    const { result } = renderHook(() =>
      useGroupsCollection<{ name: string }>(['ffnd', 'bezirk'], 'atemschutzGeraet'),
    );
    expect([...listeners.keys()]).toEqual([
      'groups/ffnd/atemschutzGeraet',
      'groups/bezirk/atemschutzGeraet',
    ]);

    emit('groups/ffnd/atemschutzGeraet', [{ id: 'a', name: 'Flasche A' }]);
    emit('groups/bezirk/atemschutzGeraet', [{ id: 'b', name: 'Flasche B' }]);

    expect(result.current).toEqual([
      { id: 'a', name: 'Flasche A', groupId: 'ffnd' },
      { id: 'b', name: 'Flasche B', groupId: 'bezirk' },
    ]);
  });

  it('abonniert eine doppelt genannte Gruppe nur einmal', () => {
    renderHook(() =>
      useGroupsCollection(['ffnd', 'ffnd', ''], 'atemschutzGeraet'),
    );
    expect([...listeners.keys()]).toEqual(['groups/ffnd/atemschutzGeraet']);
  });

  it('wartet auf den Firebase-Benutzer', () => {
    useFirebaseLoginMock.mockReturnValue({ hasFirebaseUser: false });
    const { result } = renderHook(() =>
      useGroupsCollection(['ffnd'], 'atemschutzGeraet'),
    );
    expect(listeners.size).toBe(0);
    expect(result.current).toEqual([]);
  });

  it('meldet eine weggefallene Gruppe ab und vergisst ihre Dokumente', () => {
    const { result, rerender } = renderHook(
      ({ groups }) => useGroupsCollection(groups, 'atemschutzGeraet'),
      { initialProps: { groups: ['ffnd', 'bezirk'] } },
    );
    emit('groups/ffnd/atemschutzGeraet', [{ id: 'a' }]);
    emit('groups/bezirk/atemschutzGeraet', [{ id: 'b' }]);

    rerender({ groups: ['ffnd'] });

    expect(unsubscribes.get('groups/bezirk/atemschutzGeraet')).toHaveBeenCalled();
    expect(result.current.map((r) => r.id)).toEqual(['a']);
  });
});
