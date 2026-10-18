import { describe, expect, it, vi } from 'vitest';
import type { FirecallItem } from '../../firebase/firestore';
import { createSelectionStore } from './selectionStore';

const marker = (id: string, lat = 1, lng = 1) =>
  ({ id, type: 'marker', name: id, lat, lng }) as FirecallItem;

describe('createSelectionStore', () => {
  it('setzt, schaltet und leert die Auswahl und meldet jede Änderung', () => {
    const store = createSelectionStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.setSelection(['a', 'b']);
    expect([...store.getState().selectedIds].sort()).toEqual(['a', 'b']);
    store.toggle('a');
    expect([...store.getState().selectedIds]).toEqual(['b']);
    store.clear();
    expect(store.getState().selectedIds.size).toBe(0);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('meldet ein Leeren einer leeren Auswahl nicht', () => {
    const store = createSelectionStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.clear();
    expect(listener).not.toHaveBeenCalled();
  });

  it('liefert nur Elemente aus eingeblendeten Registrierungen', () => {
    const store = createSelectionStore();
    let visible = true;
    store.register('layer-1', {
      items: [marker('a'), marker('b')],
      isVisible: () => visible,
    });
    store.register('layer-2', {
      items: [marker('c')],
      isVisible: () => true,
    });
    expect(
      store
        .visibleItems()
        .map((i) => i.id)
        .sort()
    ).toEqual(['a', 'b', 'c']);
    visible = false;
    expect(store.visibleItems().map((i) => i.id)).toEqual(['c']);
  });

  it('liefert die ausgewählten Elemente in ihrem aktuellen Stand', () => {
    const store = createSelectionStore();
    store.register('layer-1', {
      items: [marker('a', 1, 1)],
      isVisible: () => true,
    });
    store.setSelection(['a']);
    store.register('layer-1', {
      items: [marker('a', 2, 2)],
      isVisible: () => true,
    });
    expect(store.selectedItems()).toEqual([marker('a', 2, 2)]);
  });

  it('verschiebt nur ausgewählte Elemente eingeblendeter Ebenen', () => {
    const store = createSelectionStore();
    let visible = true;
    store.register('layer-1', {
      items: [marker('a')],
      isVisible: () => visible,
    });
    store.register('layer-2', {
      items: [marker('b'), marker('c')],
      isVisible: () => true,
    });
    store.setSelection(['a', 'b']);
    expect(
      store
        .movableItems()
        .map((i) => i.id)
        .sort()
    ).toEqual(['a', 'b']);
    visible = false;
    expect(store.movableItems().map((i) => i.id)).toEqual(['b']);
  });

  it('vergisst eine abgemeldete Registrierung', () => {
    const store = createSelectionStore();
    const unregister = store.register('layer-1', {
      items: [marker('a')],
      isVisible: () => true,
    });
    unregister();
    expect(store.visibleItems()).toEqual([]);
  });

  it('nimmt Elemente aus der Auswahl, die nicht mehr wählbar sind', () => {
    const store = createSelectionStore();
    store.register('layer-1', {
      items: [marker('a'), marker('b')],
      isVisible: () => true,
    });
    store.setSelection(['a', 'b']);
    store.register('layer-1', {
      items: [marker('a'), { ...marker('b'), editable: false }],
      isVisible: () => true,
    });
    expect([...store.getState().selectedIds]).toEqual(['a']);
  });

  it('schaltet den Rahmenmodus und hält die Vorschau', () => {
    const store = createSelectionStore();
    store.setBoxMode(true);
    expect(store.getState().boxMode).toBe(true);
    const preview = { delta: { lat: 1, lng: 1 }, sourceId: 'a', origins: {} };
    store.setPreview(preview);
    expect(store.getState().preview).toBe(preview);
    store.setPreview(undefined);
    expect(store.getState().preview).toBeUndefined();
  });
});
