'use client';

import { useMemo } from 'react';
import { FirecallLocation } from '../components/firebase/firestore';
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
 * Combines vehicle suggestions from two sources:
 * 1. Kostenersatz vehicles (predefined fleet)
 * 2. Custom vehicles already entered in other Einsatzorte within the same firecall
 *
 * @param locations - All FirecallLocation entries from the current firecall
 * @returns Combined, deduplicated, and sorted vehicle suggestions
 */
export function useVehicleSuggestions(
  locations: FirecallLocation[]
): UseVehicleSuggestionsResult {
  const { vehicles: kostenersatzVehicles, loading } = useKostenersatzVehicles();

  // Extract Kostenersatz vehicle names as a Set for quick lookup
  const kostenersatzVehicleNames = useMemo(() => {
    return new Set(kostenersatzVehicles.map((v) => v.name));
  }, [kostenersatzVehicles]);

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

  // Combine both sources, dedupe, and sort alphabetically
  const suggestions = useMemo(() => {
    const combined = new Set<string>();

    // Add Kostenersatz vehicle names
    kostenersatzVehicleNames.forEach((name) => combined.add(name));

    // Add custom vehicles from locations
    locationVehicleNames.forEach((name) => combined.add(name));

    // Convert to array and sort alphabetically (case-insensitive)
    return Array.from(combined).sort((a, b) =>
      a.localeCompare(b, 'de', { sensitivity: 'base' })
    );
  }, [kostenersatzVehicleNames, locationVehicleNames]);

  return {
    suggestions,
    kostenersatzVehicleNames,
    loading,
  };
}

export default useVehicleSuggestions;
