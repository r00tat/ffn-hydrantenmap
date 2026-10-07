// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { onSnapshotMock, unsubscribeMock, waitForPendingWritesMock } =
  vi.hoisted(() => ({
    onSnapshotMock: vi.fn(),
    unsubscribeMock: vi.fn(),
    waitForPendingWritesMock: vi.fn(),
  }));

vi.mock('firebase/firestore', () => ({
  onSnapshot: onSnapshotMock,
  waitForPendingWrites: waitForPendingWritesMock,
}));

const { useFirestoreQuery } = await import('./useFirestoreQuery');

interface Layer {
  id: string;
  deleted?: boolean;
}

const snapshot = {
  docs: [
    { id: 'a', data: () => ({}) },
    { id: 'b', data: () => ({ deleted: true }) },
  ],
};

const query = { __query: true } as never;

beforeEach(() => {
  vi.clearAllMocks();
  onSnapshotMock.mockImplementation((_q, next) => {
    next(snapshot);
    return unsubscribeMock;
  });
});

describe('useFirestoreQuery', () => {
  // Eine inline definierte Filterfunktion ist bei jedem Render eine neue
  // Referenz. Hing der Listener daran, meldete jeder Render den Firestore-Target
  // ab und neu an — und weil das Snapshot-Ergebnis wieder einen Render auslöste,
  // lief das endlos (~20 Requests/s auf der Listen-Verbindung).
  it('resubscribes not when only the filter identity changes', () => {
    const { rerender } = renderHook(
      ({ filterFn }: { filterFn: (l: Layer) => boolean }) =>
        useFirestoreQuery<Layer>(query, filterFn),
      { initialProps: { filterFn: (l: Layer) => l.deleted !== true } }
    );

    expect(onSnapshotMock).toHaveBeenCalledTimes(1);

    rerender({ filterFn: (l: Layer) => l.deleted !== true });
    rerender({ filterFn: (l: Layer) => l.deleted !== true });

    expect(onSnapshotMock).toHaveBeenCalledTimes(1);
    expect(unsubscribeMock).not.toHaveBeenCalled();
  });

  it('applies a changed filter to the records already received', () => {
    const { result, rerender } = renderHook(
      ({ filterFn }: { filterFn: (l: Layer) => boolean }) =>
        useFirestoreQuery<Layer>(query, filterFn),
      { initialProps: { filterFn: (l: Layer) => l.deleted !== true } }
    );

    expect(result.current.records.map((l) => l.id)).toEqual(['a']);

    rerender({ filterFn: (l: Layer) => l.id === 'b' });

    expect(result.current.records.map((l) => l.id)).toEqual(['b']);
    expect(onSnapshotMock).toHaveBeenCalledTimes(1);
  });

  it('resubscribes when the query changes', () => {
    const { rerender } = renderHook(
      ({ q }: { q: never }) => useFirestoreQuery<Layer>(q),
      { initialProps: { q: query } }
    );

    expect(onSnapshotMock).toHaveBeenCalledTimes(1);

    rerender({ q: { __query: 'other' } as never });

    expect(onSnapshotMock).toHaveBeenCalledTimes(2);
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  // Offline angelegter Einsatz: Der Listener auf seine Elemente kommt nach dem
  // Reconnect vor dem Einsatzdokument beim Server an und wird abgelehnt. Ohne
  // neues Abonnement blieb die Karte auf dem Stand vor dem Reconnect stehen.
  it('subscribes again after pending writes when permission is denied', async () => {
    waitForPendingWritesMock.mockResolvedValue(undefined);
    onSnapshotMock.mockImplementationOnce((_q, next, onError) => {
      next(snapshot);
      onError(Object.assign(new Error('denied'), { code: 'permission-denied' }));
      return unsubscribeMock;
    });

    const { result } = renderHook(() => useFirestoreQuery<Layer>(query));

    await vi.waitFor(() => expect(onSnapshotMock).toHaveBeenCalledTimes(2));
    expect(result.current.error).toBeUndefined();
    expect(result.current.records.map((l) => l.id)).toEqual(['a', 'b']);
  });

  it('reports fromCache from the snapshot metadata', () => {
    onSnapshotMock.mockImplementation((_q, next) => {
      next({ ...snapshot, metadata: { fromCache: true } });
      return unsubscribeMock;
    });
    const { result } = renderHook(() => useFirestoreQuery<Layer>(query));
    expect(result.current.fromCache).toBe(true);
  });

  it('subscribes with includeMetadataChanges only when asked', () => {
    onSnapshotMock.mockImplementation((...args: unknown[]) => {
      const next = args.find((a) => typeof a === 'function') as (
        s: unknown
      ) => void;
      next({ ...snapshot, metadata: { fromCache: false } });
      return unsubscribeMock;
    });
    renderHook(() =>
      useFirestoreQuery<Layer>(query, undefined, {
        includeMetadataChanges: true,
      })
    );
    expect(onSnapshotMock.mock.calls[0][1]).toEqual({
      includeMetadataChanges: true,
    });

    onSnapshotMock.mockClear();
    const { result } = renderHook(() => useFirestoreQuery<Layer>(query));
    expect(typeof onSnapshotMock.mock.calls[0][1]).toBe('function');
    expect(result.current.fromCache).toBe(false);
  });
});
