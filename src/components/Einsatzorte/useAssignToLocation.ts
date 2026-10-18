'use client';

import { useCallback } from 'react';
import { FirecallItem, FirecallLocation } from '../firebase/firestore';
import { useSaveHistory } from '../../hooks/firecallHistory/useSaveHistory';
import useLocationLayers from '../../hooks/useLocationLayers';
import {
  AssignableItem,
  isAssignedToLocation,
  moveItemsToLocation,
  unitWithVehicles,
} from '../pages/location-assignment';
import {
  getLocationDisplayName,
  unitLabel,
  vehicleAssignedEntry,
  vehicleRemovedEntry,
} from './locationDiary';
import useLocationDiary from './useLocationDiary';

/**
 * Setzt ein Einsatzmittel an einen Einsatzort — eine taktische Einheit samt
 * ihren Fahrzeugen. Erst wird der Verlaufsstand gesichert, dann zugeordnet,
 * auf der Karte versetzt und jeder Wechsel ins Einsatztagebuch geschrieben.
 *
 * `locationId` leer heißt: von jedem Einsatzort abziehen.
 */
export default function useAssignToLocation(
  locations: FirecallLocation[],
  updateLocation: (
    id: string,
    updates: Partial<FirecallLocation>,
  ) => Promise<void> | void,
  items: FirecallItem[],
) {
  const addDiaryEntry = useLocationDiary();
  const { saveHistory } = useSaveHistory();
  const locationLayers = useLocationLayers();

  return useCallback(
    async (target: AssignableItem, locationId: string) => {
      const item = items.find((i) => i.id === target.id);
      const moving: AssignableItem[] = item
        ? unitWithVehicles(item, items)
        : [target];
      const move = moveItemsToLocation(locations, moving, locationId);
      if (move.updates.length === 0) return;

      const anlass = move.assignedTo
        ? `Status vor ${target.name} zu Einsatzort ${getLocationDisplayName(move.assignedTo)} zugeordnet`
        : `Status vor ${target.name} von Einsatzort abgezogen`;
      await saveHistory(anlass);

      for (const update of move.updates) {
        void updateLocation(update.id, { vehicles: update.vehicles });
      }
      // Je Einsatzort ein Eintrag mit dem, was dort tatsächlich abgezogen
      // wurde — ein Fahrzeug kann woanders stehen als seine Einheit.
      for (const location of move.removedFrom) {
        const here = moving.filter((m) => isAssignedToLocation(location, m));
        void addDiaryEntry(
          vehicleRemovedEntry(here.map(unitLabel).join(', '), location),
        );
      }

      const onMap = (m: AssignableItem) =>
        items.find((i) => i.id === m.id && !!m.id);
      if (move.assignedTo) {
        const [first, ...rest] = moving;
        const label = rest.length
          ? `${unitLabel(first)} mit ${rest.map(unitLabel).join(', ')}`
          : unitLabel(first);
        void addDiaryEntry(vehicleAssignedEntry(label, move.assignedTo));
        // Auf der Karte zum Einsatzort versetzen und in seine Ebene legen
        for (const m of moving) {
          const mapItem = onMap(m);
          if (mapItem) void locationLayers.placeItem(mapItem, move.assignedTo);
        }
      } else {
        for (const location of move.removedFrom) {
          for (const m of moving) {
            const mapItem = onMap(m);
            if (mapItem && isAssignedToLocation(location, m)) {
              void locationLayers.releaseItem(mapItem, location);
            }
          }
        }
      }
    },
    [addDiaryEntry, items, locationLayers, locations, saveHistory, updateLocation],
  );
}
