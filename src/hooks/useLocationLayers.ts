'use client';

import { doc } from 'firebase/firestore';
import { useCallback, useMemo, useRef } from 'react';
import { firestore } from '../components/firebase/firebase';
import {
  FIRECALL_COLLECTION_ID,
  FirecallItem,
  FirecallLayer,
  FirecallLocation,
} from '../components/firebase/firestore';
import {
  locationLayerName,
  placeAtLocation,
  releaseFromLocationLayer,
  resolveLocationLayer,
} from '../components/Einsatzorte/locationLayers';
import { isAssignedToLocation } from '../components/pages/location-assignment';
import { updateDocLocal } from '../lib/firestoreClient';
import useFirecall, { useFirecallId } from './useFirecall';
import useFirecallItemAdd from './useFirecallItemAdd';
import useFirecallItemUpdate from './useFirecallItemUpdate';
import { useFirecallLayers } from './useFirecallLayers';
import useFirecallLocations from './useFirecallLocations';

/**
 * Ebene je Einsatzort: Fahrzeuge und Einheiten, die einem Einsatzort
 * zugeordnet werden, landen auf der Karte bei ihm — an seinen Koordinaten und,
 * wenn am Einsatz eingeschaltet, in seiner Ebene. Siehe
 * docs/einsatzort-ebenen.md.
 */
export default function useLocationLayers() {
  const firecall = useFirecall();
  const firecallId = useFirecallId();
  const enabled = firecall?.locationLayers === true;
  const layersMap = useFirecallLayers();
  const addFirecallItem = useFirecallItemAdd();
  const updateFirecallItem = useFirecallItemUpdate();
  const { updateLocation } = useFirecallLocations();

  // Gerade angelegte Ebenen je Einsatzort, bis Einsatzort und Ebenen-Liste
  // sie zeigen — siehe `resolveLocationLayer`.
  const pending = useRef<Record<string, string>>({});
  const activeLayerIds = useMemo(
    () => new Set(Object.keys(layersMap)),
    [layersMap],
  );

  const ensureLayer = useCallback(
    async (location: FirecallLocation): Promise<string | undefined> => {
      if (!location.id) return undefined;
      const existing = resolveLocationLayer(
        location,
        activeLayerIds,
        pending.current[location.id],
      );
      if (existing) return existing;

      const layer: FirecallLayer = {
        type: 'layer',
        name: locationLayerName(location),
      };
      const ref = await addFirecallItem(layer);
      pending.current[location.id] = ref.id;
      await updateLocation(location.id, { layer: ref.id });
      return ref.id;
    },
    [activeLayerIds, addFirecallItem, updateLocation],
  );

  /** Die Ebene für neue Elemente an diesem Einsatzort — leer, wenn aus. */
  const layerFor = useCallback(
    async (location: FirecallLocation) =>
      enabled ? ensureLayer(location) : undefined,
    [enabled, ensureLayer],
  );

  /** Ein zugeordnetes Element zum Einsatzort versetzen und in seine Ebene legen. */
  const placeItem = useCallback(
    async (item: FirecallItem, location: FirecallLocation) => {
      const layerId = await layerFor(location);
      const next = placeAtLocation(item, location, layerId);
      if (next) await updateFirecallItem(next);
    },
    [layerFor, updateFirecallItem],
  );

  /** Ein abgezogenes Element aus der Ebene des Einsatzorts nehmen. */
  const releaseItem = useCallback(
    async (item: FirecallItem, location: FirecallLocation) => {
      if (!enabled) return;
      const next = releaseFromLocationLayer(item, location);
      if (next) await updateFirecallItem(next);
    },
    [enabled, updateFirecallItem],
  );

  /**
   * Schaltet „Ebene je Einsatzort" am Einsatz um. Beim Einschalten bekommen
   * die Einsatzorte mit Zuordnungen ihre Ebene und die zugeordneten Elemente
   * wandern hinein — versetzt wird dabei nichts, die Kräfte stehen schon, wo
   * sie stehen. Beim Ausschalten bleiben die Ebenen, wie sie sind: Eine Ebene
   * zu löschen, löscht ihre Elemente mit.
   */
  const setEnabled = useCallback(
    async (
      on: boolean,
      locations: FirecallLocation[],
      items: FirecallItem[],
    ) => {
      updateDocLocal(doc(firestore, FIRECALL_COLLECTION_ID, firecallId), {
        locationLayers: on,
      });
      if (!on) return;

      for (const location of locations) {
        const assigned = items.filter(
          (item) => item.id && isAssignedToLocation(location, item),
        );
        if (assigned.length === 0) continue;
        const layerId = await ensureLayer(location);
        if (!layerId) continue;
        for (const item of assigned) {
          if (item.layer !== layerId) {
            await updateFirecallItem({ ...item, layer: layerId });
          }
        }
      }
    },
    [firecallId, ensureLayer, updateFirecallItem],
  );

  return { enabled, layerFor, placeItem, releaseItem, setEnabled };
}
