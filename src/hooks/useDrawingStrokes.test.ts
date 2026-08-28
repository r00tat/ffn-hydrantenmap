// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../components/firebase/firebase', () => ({
  default: {},
  firestore: {},
}));

vi.mock('./useFirecall', () => ({
  useFirecallId: () => 'fc1',
}));

const historyPathSegments = { value: [] as string[] };

vi.mock('./useMapEditor', () => ({
  useHistoryPathSegments: () => historyPathSegments.value,
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((...args: unknown[]) => ({
    path: args.filter((a) => typeof a === 'string').join('/'),
  })),
  query: vi.fn((col: unknown) => col),
  orderBy: vi.fn(),
  getDocs: vi.fn(),
}));

import { getDocs } from 'firebase/firestore';
import { useDrawingStrokes } from './useDrawingStrokes';

/** Pfad der Sammlung, aus der zuletzt gelesen wurde. */
function queriedPath(): string {
  const [firstCall] = vi.mocked(getDocs).mock.calls;
  return (firstCall[0] as unknown as { path: string }).path;
}

describe('useDrawingStrokes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    historyPathSegments.value = [];
    vi.mocked(getDocs).mockResolvedValue({
      docs: [
        {
          data: () => ({
            color: '#ff0000',
            width: 3,
            points: [47, 16, 47.1, 16.1],
            order: 0,
          }),
        },
      ],
    } as never);
  });

  it('reads the strokes of the live firecall', async () => {
    renderHook(() => useDrawingStrokes('draw1'));

    await waitFor(() => expect(getDocs).toHaveBeenCalled());
    expect(queriedPath()).toBe('call/fc1/item/draw1/stroke');
  });

  it('reads the strokes of the snapshot while history mode is active', async () => {
    // Sonst zeigt eine alte Lage die Zeichnung von heute.
    historyPathSegments.value = ['history', 'h1'];

    renderHook(() => useDrawingStrokes('draw1'));

    await waitFor(() => expect(getDocs).toHaveBeenCalled());
    expect(queriedPath()).toBe('call/fc1/history/h1/item/draw1/stroke');
  });

  it('unflattens the stored point pairs', async () => {
    const { result } = renderHook(() => useDrawingStrokes('draw1'));

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0].points).toEqual([
      [47, 16],
      [47.1, 16.1],
    ]);
  });

  it('does not query without an item', () => {
    renderHook(() => useDrawingStrokes(undefined));

    expect(getDocs).not.toHaveBeenCalled();
  });
});
