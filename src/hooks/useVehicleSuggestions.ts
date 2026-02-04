'use client';

import { useMemo } from 'react';
import { FirecallLocation, Fzg } from '../components/firebase/firestore';
import { useKostenersatzVehicles } from './useKostenersatzVehicles';

export interface UseVehicleSuggestionsResult {
  /** Combined list of all vehicle suggestions, sorted alphabetically */
  suggestions: string[];
  /** Set of vehicle names from Kostenersatz (for quick lookup to identify predefined fleet) */
  kostenersatzVehicleNames: Set<string>;
  /** Loading state from Kostenersatz vehicles */
  loading: boolean;
}

/**
 * Combines vehicle suggestions from three sources:
 * 1. Kostenersatz vehicles (predefined fleet)
 * 2. Vehicles already on the map (Fzg items from firecall)
 * 3. Custom vehicles already entered in other Einsatzorte within the same firecall
 *
 * @param locations - All FirecallLocation entries from the current firecall
 * @param mapVehicles - All Fzg items currently on the map
 * @returns Combined, deduplicated, and sorted vehicle suggestions
 */
export function useVehicleSuggestions(
  locations: FirecallLocation[],
  mapVehicles: Fzg[] = []
): UseVehicleSuggestionsResult {
  const { vehicles: kostenersatzVehicles, loading } = useKostenersatzVehicles();

  // Extract Kostenersatz vehicle names as a Set for quick lookup
  const kostenersatzVehicleNames = useMemo(() => {
    return new Set(kostenersatzVehicles.map((v) => v.name));
  }, [kostenersatzVehicles]);

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

  // Collect all unique vehicles from current firecall locations
  const locationVehicleNames = useMemo(() => {
    const names = new Set<string>();
    for (const location of locations) {
      if (location.vehicles && Array.isArray(location.vehicles)) {
        for (const vehicle of location.vehicles) {
          if (vehicle && vehicle.trim()) {
            names.add(vehicle.trim());
          }
        }
      }
    }
    return names;
  }, [locations]);

  // Combine all sources, dedupe, and sort alphabetically
  const suggestions = useMemo(() => {
    const combined = new Set<string>();

    // Add Kostenersatz vehicle names
    kostenersatzVehicleNames.forEach((name) => combined.add(name));

    // Add vehicles from map
    mapVehicleNames.forEach((name) => combined.add(name));

    // Add custom vehicles from locations
    locationVehicleNames.forEach((name) => combined.add(name));

    // Convert to array and sort alphabetically (case-insensitive)
    return Array.from(combined).sort((a, b) =>
      a.localeCompare(b, 'de', { sensitivity: 'base' })
    );
  }, [kostenersatzVehicleNames, mapVehicleNames, locationVehicleNames]);

  return {
    suggestions,
    kostenersatzVehicleNames,
    loading,
  };
}

export default useVehicleSuggestions;
