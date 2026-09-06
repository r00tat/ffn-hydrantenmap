// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { onSnapshotMock, unsubscribeMock } = vi.hoisted(() => ({
  onSnapshotMock: vi.fn(),
  unsubscribeMock: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({ onSnapshot: onSnapshotMock }));

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
});
