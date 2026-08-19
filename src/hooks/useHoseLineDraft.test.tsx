// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FirecallItem } from '../components/firebase/firestore';
import { buildHoseLineDraft, HoseLineDraft } from '../common/waterSupply';

const addFirecallItem = vi.fn(async (item: FirecallItem) => ({
  id: `connection-${item.name}`,
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

const target = { lat: 47.9482913, lng: 16.848222 };

const draftA: HoseLineDraft = buildHoseLineDraft({
  source: { kind: 'hydrant', name: 'ÜH Hauptstraße 12', lat: 47.949, lng: 16.8482 },
  target,
  reason: 'nächster Überflurhydrant',
});
const draftB: HoseLineDraft = buildHoseLineDraft({
  source: { kind: 'hydrant', name: 'UH Seegasse 3', lat: 47.9495, lng: 16.849 },
  target,
});

describe('useHoseLineDraft', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is a no-op without a provider so the assistant still works without a map', () => {
    const { result } = renderHook(() => useHoseLineDraft());
    expect(result.current.drafts).toEqual([]);
    expect(() => result.current.proposeDrafts([draftA])).not.toThrow();
  });

  it('holds several proposals at once without writing them to the firecall', () => {
    const { result } = renderHook(() => useHoseLineDraft(), { wrapper });

    act(() => result.current.proposeDrafts([draftA, draftB]));

    expect(result.current.drafts).toEqual([draftA, draftB]);
    expect(addFirecallItem).not.toHaveBeenCalled();
  });

  it('replaces the previous round instead of stacking proposals', () => {
    const { result } = renderHook(() => useHoseLineDraft(), { wrapper });

    act(() => result.current.proposeDrafts([draftA, draftB]));
    act(() => result.current.proposeDrafts([draftB]));

    expect(result.current.drafts).toEqual([draftB]);
  });

  it('creates a connection for a single draft and leaves the others standing', async () => {
    const { result } = renderHook(() => useHoseLineDraft(), { wrapper });

    act(() => result.current.proposeDrafts([draftA, draftB]));
    await act(async () => {
      expect(await result.current.confirmDraft(draftA.id)).toBeTruthy();
    });

    expect(addFirecallItem).toHaveBeenCalledTimes(1);
    const item = addFirecallItem.mock.calls[0][0] as any;
    expect(item.type).toBe('connection');
    expect(item.name).toBe(draftA.name);
    expect(item.dimension).toBe('B');
    expect(item.oneHozeLength).toBe(20);
    expect(item.distance).toBe(draftA.distance);
    expect(item.beschreibung).toBe('nächster Überflurhydrant');
    expect(JSON.parse(item.positions)).toEqual(draftA.positions);
    expect([item.lat, item.lng]).toEqual(draftA.positions[0]);
    expect([item.destLat, item.destLng]).toEqual(
      draftA.positions[draftA.positions.length - 1]
    );
    expect(result.current.drafts).toEqual([draftB]);
  });

  it('creates one connection per draft when all are confirmed', async () => {
    const { result } = renderHook(() => useHoseLineDraft(), { wrapper });

    act(() => result.current.proposeDrafts([draftA, draftB]));
    await act(async () => {
      expect(await result.current.confirmAllDrafts()).toBe(2);
    });

    expect(addFirecallItem).toHaveBeenCalledTimes(2);
    expect(result.current.drafts).toEqual([]);
  });

  it('does nothing when confirming an unknown draft', async () => {
    const { result } = renderHook(() => useHoseLineDraft(), { wrapper });

    act(() => result.current.proposeDrafts([draftA]));
    await act(async () => {
      expect(await result.current.confirmDraft('gibt-es-nicht')).toBeUndefined();
    });

    expect(addFirecallItem).not.toHaveBeenCalled();
    expect(result.current.drafts).toEqual([draftA]);
  });

  it('keeps the draft when saving fails so the user can retry', async () => {
    addFirecallItem.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useHoseLineDraft(), { wrapper });

    act(() => result.current.proposeDrafts([draftA]));
    await act(async () => {
      await expect(result.current.confirmDraft(draftA.id)).rejects.toThrow(
        'offline'
      );
    });

    expect(result.current.drafts).toEqual([draftA]);
  });

  it('drops a single draft on discard', () => {
    const { result } = renderHook(() => useHoseLineDraft(), { wrapper });

    act(() => result.current.proposeDrafts([draftA, draftB]));
    act(() => result.current.discardDraft(draftA.id));

    expect(result.current.drafts).toEqual([draftB]);
    expect(addFirecallItem).not.toHaveBeenCalled();
  });

  it('drops everything on discard all', () => {
    const { result } = renderHook(() => useHoseLineDraft(), { wrapper });

    act(() => result.current.proposeDrafts([draftA, draftB]));
    act(() => result.current.discardAllDrafts());

    expect(result.current.drafts).toEqual([]);
    expect(addFirecallItem).not.toHaveBeenCalled();
  });
});
