'use client';

import { useMemo } from 'react';
import { Fzg } from '../components/firebase/firestore';
import { useKostenersatzVehicles } from './useKostenersatzVehicles';

export interface UseVehicleSuggestionsResult {
  /** Map vehicles (Fzg items) for ID-based selection */
  mapVehicles: Fzg[];
  /** Set of vehicle names from Kostenersatz (predefined fleet not yet on map) */
  kostenersatzVehicleNames: Set<string>;
  /** Loading state from Kostenersatz vehicles */
  loading: boolean;
}

/**
 * Provides vehicle data for autocomplete:
 * 1. Map vehicles (Fzg items) - have IDs, can be directly referenced
 * 2. Kostenersatz vehicles (predefined fleet) - must be added to map first
 *
 * @param mapVehicles - All Fzg items currently on the map
 * @returns Vehicle data for autocomplete selection
 */
export function useVehicleSuggestions(
  mapVehicles: Fzg[] = []
): UseVehicleSuggestionsResult {
  const { vehicles: kostenersatzVehicles, loading } = useKostenersatzVehicles();

  // Extract Kostenersatz vehicle names as a Set for quick lookup
  // Only include names that are NOT already on the map
  const kostenersatzVehicleNames = useMemo(() => {
    const mapNames = new Set(mapVehicles.map((v) => v.name?.toLowerCase()));
    return new Set(
      kostenersatzVehicles
        .map((v) => v.name)
        .filter((name) => !mapNames.has(name.toLowerCase()))
    );
  }, [kostenersatzVehicles, mapVehicles]);

  return {
    mapVehicles,
    kostenersatzVehicleNames,
    loading,
  };
}

export default useVehicleSuggestions;
