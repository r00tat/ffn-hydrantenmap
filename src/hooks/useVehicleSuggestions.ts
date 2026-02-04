'use client';

import { useMemo } from 'react';
import { Fzg } from '../components/firebase/firestore';
import { useKostenersatzVehicles } from './useKostenersatzVehicles';

export interface UseVehicleSuggestionsResult {
  /** Combined list of all vehicle suggestions, sorted alphabetically */
  suggestions: string[];
  /** Set of vehicle names from Kostenersatz (for quick lookup to identify predefined fleet) */
  kostenersatzVehicleNames: Set<string>;
  /** Map of vehicle name to Feuerwehr (FW) for display in autocomplete */
  vehicleFwMap: Map<string, string>;
  /** Loading state from Kostenersatz vehicles */
  loading: boolean;
}

/**
 * Combines vehicle suggestions from two sources:
 * 1. Kostenersatz vehicles (predefined fleet)
 * 2. Vehicles already on the map (Fzg items from firecall)
 *
 * @param mapVehicles - All Fzg items currently on the map
 * @returns Combined, deduplicated, and sorted vehicle suggestions
 */
export function useVehicleSuggestions(
  mapVehicles: Fzg[] = []
): UseVehicleSuggestionsResult {
  const { vehicles: kostenersatzVehicles, loading } = useKostenersatzVehicles();

  // Extract Kostenersatz vehicle names as a Set for quick lookup
  const kostenersatzVehicleNames = useMemo(() => {
    return new Set(kostenersatzVehicles.map((v) => v.name));
  }, [kostenersatzVehicles]);

  // Build a map of vehicle name to FW (Feuerwehr) for display
  const vehicleFwMap = useMemo(() => {
    const map = new Map<string, string>();
    // Add FW from map vehicles
    for (const vehicle of mapVehicles) {
      if (vehicle.name && vehicle.fw) {
        map.set(vehicle.name.trim(), vehicle.fw);
      }
    }
    return map;
  }, [mapVehicles]);

  // Collect vehicle names from map (Fzg items)
  const mapVehicleNames = useMemo(() => {
    const names = new Set<string>();
    for (const vehicle of mapVehicles) {
      if (vehicle.name && vehicle.name.trim()) {
        names.add(vehicle.name.trim());
      }
    }
    return names;
  }, [mapVehicles]);

  // Combine both sources, dedupe, and sort alphabetically
  const suggestions = useMemo(() => {
    const combined = new Set<string>();

    // Add Kostenersatz vehicle names
    kostenersatzVehicleNames.forEach((name) => combined.add(name));

    // Add vehicles from map
    mapVehicleNames.forEach((name) => combined.add(name));

    // Convert to array and sort alphabetically (case-insensitive)
    return Array.from(combined).sort((a, b) =>
      a.localeCompare(b, 'de', { sensitivity: 'base' })
    );
  }, [kostenersatzVehicleNames, mapVehicleNames]);

  return {
    suggestions,
    kostenersatzVehicleNames,
    vehicleFwMap,
    loading,
  };
}

export default useVehicleSuggestions;
