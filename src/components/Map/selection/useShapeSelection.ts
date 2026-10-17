'use client';

import type L from 'leaflet';
import { useCallback } from 'react';
import { useMapEditable } from '../../../hooks/useMapEditor';
import type { FirecallItem } from '../../firebase/firestore';
import {
  useIsItemSelected,
  useMapSelectionStore,
  useSelectionPreviewDelta,
} from './MapSelectionContext';

/** Linienstil einer ausgewählten Linie oder Fläche: dicker und gestrichelt. */
export const SELECTED_PATH_OPTIONS: L.PathOptions = {
  dashArray: '10 6',
  weight: 6,
};

/**
 * Mehrfachauswahl für Linien, Leitungen und Flächen: ob das Element gewählt
 * ist, um wie viel es gerade vorschauweise versetzt ist, und ein Klick-Handler
 * für Umschalt-Klick bzw. Tippen im Auswahlmodus.
 */
export function useShapeSelection(record: FirecallItem) {
  const store = useMapSelectionStore();
  const editable = useMapEditable();
  const selected = useIsItemSelected(record.id);
  const delta = useSelectionPreviewDelta(record);
  const id = record.id;

  /** `true`, wenn der Klick die Auswahl geändert hat und sonst nichts tun soll. */
  const handleSelectClick = useCallback(
    (event: L.LeafletMouseEvent): boolean => {
      if (!store || !editable || !id) return false;
      if (!(event.originalEvent?.shiftKey || store.getState().boxMode)) {
        return false;
      }
      store.toggle(id);
      const layer = event.target as L.Layer;
      // Leaflet öffnet das Popup im selben Klick; danach wieder schließen.
      setTimeout(() => layer.closePopup(), 0);
      return true;
    },
    [store, editable, id]
  );

  return { selected, delta, handleSelectClick };
}
