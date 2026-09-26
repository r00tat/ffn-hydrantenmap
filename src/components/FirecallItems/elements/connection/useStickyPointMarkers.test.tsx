// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mapEvents = vi.hoisted(() => ({
  click: undefined as undefined | ((event: any) => void),
}));

vi.mock('react-leaflet', () => ({
  useMapEvent: (name: string, handler: (event: any) => void) => {
    if (name === 'click') mapEvents.click = handler;
  },
}));

const { useStickyPointMarkers } = await import('./useStickyPointMarkers');

describe('useStickyPointMarkers', () => {
  beforeEach(() => {
    mapEvents.click = undefined;
  });

  it('zeigt die Punkte, sobald ein Popup aufgeht, und lässt sie danach stehen', () => {
    const { result } = renderHook(() => useStickyPointMarkers());
    expect(result.current.visible).toBe(false);

    act(() => result.current.show());

    expect(result.current.visible).toBe(true);
  });

  it('blendet die Punkte beim Klick woanders auf die Karte aus', () => {
    const { result } = renderHook(() => useStickyPointMarkers());
    act(() => result.current.show());

    act(() => mapEvents.click?.({ originalEvent: new MouseEvent('click') }));

    expect(result.current.visible).toBe(false);
  });

  it('lässt die Punkte stehen, wenn der Klick auf das eigene Element ging', () => {
    const { result } = renderHook(() => useStickyPointMarkers());
    act(() => result.current.show());
    const click = new MouseEvent('click');

    // Leaflet reicht den Klick auf einen Pfad an die Karte weiter.
    act(() => result.current.markOwnClick({ originalEvent: click } as any));
    act(() => mapEvents.click?.({ originalEvent: click }));

    expect(result.current.visible).toBe(true);
  });
});
