// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../components/firebase/firebase', () => ({
  default: {},
  firestore: {},
}));

vi.mock('../useFirecall', () => ({
  useFirecallId: () => 'fc1',
}));

const mockCommitInBatches = vi.fn();

vi.mock('../../lib/firestoreClient', () => ({
  addDoc: vi.fn(() => Promise.resolve({ id: 'h1' })),
  commitInBatches: (...args: never[]) =>
    (mockCommitInBatches as unknown as (...a: never[]) => Promise<void>)(
      ...args
    ),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((...args: unknown[]) => ({
    path: args.filter((a) => typeof a === 'string').join('/'),
  })),
  doc: vi.fn((...args: unknown[]) => ({
    path: args.filter((a) => typeof a === 'string').join('/'),
  })),
  query: vi.fn((col: unknown) => col),
  getDocs: vi.fn(),
}));

import { getDocs } from 'firebase/firestore';
import { useSaveHistory } from './useSaveHistory';

type Op = { ref: { path: string }; data: Record<string, unknown> };

/** Alle Schreibvorgänge über alle `commitInBatches`-Aufrufe hinweg. */
function writtenOperations(): Op[] {
  return mockCommitInBatches.mock.calls.flatMap((call) => call[1] as Op[]);
}

describe('useSaveHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCommitInBatches.mockResolvedValue(undefined);

    vi.mocked(getDocs).mockImplementation((col: unknown) => {
      const path = (col as { path?: string }).path ?? '';
      if (path === 'call/fc1/item') {
        return Promise.resolve({
          docs: [
            { id: 'draw1', data: () => ({ name: 'Skizze', type: 'drawing' }) },
            { id: 'm1', data: () => ({ name: 'Marker', type: 'marker' }) },
          ],
        }) as never;
      }
      if (path === 'call/fc1/item/draw1/stroke') {
        return Promise.resolve({
          docs: [
            {
              id: 's1',
              data: () => ({
                color: '#ff0000',
                width: 3,
                points: [47, 16, 47.1, 16.1],
                order: 0,
              }),
            },
          ],
        }) as never;
      }
      if (path === 'call/fc1/layer') {
        return Promise.resolve({
          docs: [{ id: 'l1', data: () => ({ name: 'Ebene', type: 'layer' }) }],
        }) as never;
      }
      return Promise.resolve({ docs: [] }) as never;
    });
  });

  it('copies the strokes of a drawing into the snapshot', async () => {
    // Ohne die Striche sichert der Snapshot eine leere Zeichnung.
    const { result } = renderHook(() => useSaveHistory());

    await result.current.saveHistory('Test');

    const stroke = writtenOperations().find(
      (op) => op.data.color === '#ff0000'
    );
    expect(stroke).toBeDefined();
    expect(stroke!.ref.path).toBe(
      'call/fc1/history/h1/item/draw1/stroke/s1'
    );
  });

  it('copies items and layers into the snapshot', async () => {
    const { result } = renderHook(() => useSaveHistory());

    await result.current.saveHistory('Test');

    const paths = writtenOperations().map((op) => op.ref.path);
    expect(paths).toContain('call/fc1/history/h1/item/draw1');
    expect(paths).toContain('call/fc1/history/h1/item/m1');
    expect(paths).toContain('call/fc1/history/h1/layer/l1');
  });

  it('does not look for strokes on items that are not drawings', async () => {
    const { result } = renderHook(() => useSaveHistory());

    await result.current.saveHistory('Test');

    const strokeQueries = vi
      .mocked(getDocs)
      .mock.calls.map((call) => (call[0] as { path?: string }).path)
      .filter((path) => path?.endsWith('/stroke'));
    expect(strokeQueries).toEqual(['call/fc1/item/draw1/stroke']);
  });
});
