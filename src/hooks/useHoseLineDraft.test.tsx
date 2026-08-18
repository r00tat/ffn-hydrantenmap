// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FirecallItem } from '../components/firebase/firestore';
import { buildHoseLineDraft, HoseLineDraft } from '../common/waterSupply';

const addFirecallItem = vi.fn(async (item: FirecallItem) => ({
  id: 'connection-1',
  item,
}));

vi.mock('./useFirecallItemAdd', () => ({
  default: () => addFirecallItem,
}));

import HoseLineDraftProvider from '../components/providers/HoseLineDraftProvider';
import { useHoseLineDraft } from './useHoseLineDraft';

const wrapper = ({ children }: { children: ReactNode }) => (
  <HoseLineDraftProvider>{children}</HoseLineDraftProvider>
);

const draft: HoseLineDraft = buildHoseLineDraft({
  source: {
    kind: 'hydrant',
    name: 'ÜH Hauptstraße 12',
    lat: 47.949,
    lng: 16.8482,
  },
  target: { lat: 47.9482913, lng: 16.848222 },
  reason: 'nächster Überflurhydrant',
});

describe('useHoseLineDraft', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is a no-op without a provider so the assistant still works without a map', () => {
    const { result } = renderHook(() => useHoseLineDraft());
    expect(result.current.draft).toBeNull();
    expect(() => result.current.proposeDraft(draft)).not.toThrow();
  });

  it('holds a proposed draft without writing it to the firecall', () => {
    const { result } = renderHook(() => useHoseLineDraft(), { wrapper });

    act(() => result.current.proposeDraft(draft));

    expect(result.current.draft).toEqual(draft);
    expect(addFirecallItem).not.toHaveBeenCalled();
  });

  it('replaces an earlier draft instead of stacking proposals', () => {
    const { result } = renderHook(() => useHoseLineDraft(), { wrapper });
    const second = { ...draft, name: 'C-Leitung' };

    act(() => result.current.proposeDraft(draft));
    act(() => result.current.proposeDraft(second));

    expect(result.current.draft).toEqual(second);
  });

  it('creates a connection item on confirm and clears the draft', async () => {
    const { result } = renderHook(() => useHoseLineDraft(), { wrapper });

    act(() => result.current.proposeDraft(draft));
    let id: string | undefined;
    await act(async () => {
      id = await result.current.confirmDraft();
    });

    expect(id).toBe('connection-1');
    expect(addFirecallItem).toHaveBeenCalledTimes(1);
    const item = addFirecallItem.mock.calls[0][0] as any;
    expect(item.type).toBe('connection');
    expect(item.name).toBe(draft.name);
    expect(item.dimension).toBe('B');
    expect(item.oneHozeLength).toBe(20);
    expect(item.distance).toBe(draft.distance);
    expect(item.beschreibung).toBe('nächster Überflurhydrant');
    expect(JSON.parse(item.positions)).toEqual(draft.positions);
    expect([item.lat, item.lng]).toEqual(draft.positions[0]);
    expect([item.destLat, item.destLng]).toEqual(
      draft.positions[draft.positions.length - 1]
    );
    expect(result.current.draft).toBeNull();
  });

  it('does nothing when confirming without a draft', async () => {
    const { result } = renderHook(() => useHoseLineDraft(), { wrapper });

    await act(async () => {
      expect(await result.current.confirmDraft()).toBeUndefined();
    });
    expect(addFirecallItem).not.toHaveBeenCalled();
  });

  it('keeps the draft when saving fails so the user can retry', async () => {
    addFirecallItem.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useHoseLineDraft(), { wrapper });

    act(() => result.current.proposeDraft(draft));
    await act(async () => {
      await expect(result.current.confirmDraft()).rejects.toThrow('offline');
    });

    expect(result.current.draft).toEqual(draft);
  });

  it('drops the draft on discard', () => {
    const { result } = renderHook(() => useHoseLineDraft(), { wrapper });

    act(() => result.current.proposeDraft(draft));
    act(() => result.current.discardDraft());

    expect(result.current.draft).toBeNull();
    expect(addFirecallItem).not.toHaveBeenCalled();
  });
});
