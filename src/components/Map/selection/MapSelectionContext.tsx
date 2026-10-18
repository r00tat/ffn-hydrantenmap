'use client';

import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
} from 'react';
import type { FirecallItem } from '../../firebase/firestore';
import { LatLngDelta, previewDeltaFor } from './multiSelect';
import {
  createSelectionStore,
  SelectionState,
  SelectionStore,
} from './selectionStore';

const MapSelectionContext = createContext<SelectionStore | null>(null);

export function MapSelectionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [store] = useState(createSelectionStore);
  return (
    <MapSelectionContext.Provider value={store}>
      {children}
    </MapSelectionContext.Provider>
  );
}

/** `null` außerhalb eines Providers — etwa bei Vorschau-Markern. */
export function useMapSelectionStore(): SelectionStore | null {
  return useContext(MapSelectionContext);
}

const noopSubscribe = () => () => {};

/**
 * Liest einen Ausschnitt des Zustands. Der Selektor muss einen stabilen Wert
 * liefern (Primitive oder unveränderte Referenzen), sonst rendert die
 * Komponente bei jeder Änderung des Stores neu.
 */
export function useSelectionState<T>(
  selector: (state: SelectionState) => T,
  fallback: T
): T {
  const store = useMapSelectionStore();
  return useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    () => (store ? selector(store.getState()) : fallback),
    () => fallback
  );
}

export function useIsItemSelected(id: string | undefined): boolean {
  return useSelectionState((s) => !!id && s.selectedIds.has(id), false);
}

export function useSelectionCount(): number {
  return useSelectionState((s) => s.selectedIds.size, 0);
}

export function useBoxSelectMode(): boolean {
  return useSelectionState((s) => s.boxMode, false);
}

/** Vorschauverschiebung dieses Elements, solange eine Gruppe gezogen wird. */
export function useSelectionPreviewDelta(
  item: FirecallItem
): LatLngDelta | undefined {
  return useSelectionState((s) => previewDeltaFor(item, s.preview), undefined);
}
