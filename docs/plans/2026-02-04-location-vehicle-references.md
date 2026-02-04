# Location Vehicle References Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Change vehicle references in FirecallLocation from name strings to ID-based references linking to Fzg documents on the map.

**Architecture:** Vehicles stored as `Record<string, string>` where key is Fzg document ID and value is vehicle name (fallback display). All vehicles must exist on the map - Kostenersatz vehicles are created on the map first, then referenced by ID.

**Tech Stack:** TypeScript, React, Firebase Firestore, MUI

---

## Task 1: Update FirecallLocation Type

**Files:**
- Modify: `src/components/firebase/firestore.ts:219`
- Modify: `src/components/firebase/firestore.ts:250`

**Step 1: Change vehicles type in FirecallLocation interface**

In `src/components/firebase/firestore.ts`, change line 219 from:
```typescript
  vehicles: string[];
```
to:
```typescript
  vehicles: Record<string, string>;
```

**Step 2: Update defaultFirecallLocation**

In `src/components/firebase/firestore.ts`, change line 250 from:
```typescript
  vehicles: [],
```
to:
```typescript
  vehicles: {},
```

**Step 3: Verify TypeScript compiles**

Run: `npm run build 2>&1 | head -50`
Expected: Type errors in components that use `vehicles` (this is expected - we'll fix them next)

---

## Task 2: Update useVehicleSuggestions Hook

**Files:**
- Modify: `src/hooks/useVehicleSuggestions.ts`

**Step 1: Update return type to include mapVehicles**

Replace the entire file with:

```typescript
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
```

---

## Task 3: Update VehicleAutocomplete Component

**Files:**
- Modify: `src/components/Einsatzorte/VehicleAutocomplete.tsx`

**Step 1: Replace the entire component**

```typescript
'use client';

import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useCallback, useMemo, useState } from 'react';
import { Fzg } from '../firebase/firestore';

interface VehicleAutocompleteProps {
  /** Current vehicles as Record<id, name> */
  value: Record<string, string>;
  /** Called when vehicles change */
  onChange: (vehicles: Record<string, string>) => void;
  /** Map vehicles (Fzg items with IDs) */
  mapVehicles: Fzg[];
  /** Kostenersatz vehicle names (not yet on map) */
  kostenersatzVehicleNames: Set<string>;
  disabled?: boolean;
  /** Called when a Kostenersatz vehicle is selected (needs to be added to map first) */
  onKostenersatzVehicleSelected?: (vehicleName: string) => void;
}

type SuggestionOption = {
  type: 'map';
  vehicle: Fzg;
} | {
  type: 'kostenersatz';
  name: string;
};

export default function VehicleAutocomplete({
  value,
  onChange,
  mapVehicles,
  kostenersatzVehicleNames,
  disabled = false,
  onKostenersatzVehicleSelected,
}: VehicleAutocompleteProps) {
  const [inputValue, setInputValue] = useState('');

  // Build suggestion options, excluding already-selected vehicles
  const options = useMemo((): SuggestionOption[] => {
    const selectedIds = new Set(Object.keys(value));
    const selectedNames = new Set(Object.values(value).map((n) => n.toLowerCase()));

    const result: SuggestionOption[] = [];

    // Add map vehicles (not already selected)
    for (const vehicle of mapVehicles) {
      if (vehicle.id && !selectedIds.has(vehicle.id)) {
        result.push({ type: 'map', vehicle });
      }
    }

    // Add Kostenersatz vehicles (not already on map and not selected by name)
    for (const name of kostenersatzVehicleNames) {
      if (!selectedNames.has(name.toLowerCase())) {
        result.push({ type: 'kostenersatz', name });
      }
    }

    // Sort alphabetically by display name
    result.sort((a, b) => {
      const nameA = a.type === 'map' ? a.vehicle.name : a.name;
      const nameB = b.type === 'map' ? b.vehicle.name : b.name;
      return nameA.localeCompare(nameB, 'de', { sensitivity: 'base' });
    });

    return result;
  }, [mapVehicles, kostenersatzVehicleNames, value]);

  // Get display name for an option
  const getOptionLabel = useCallback((option: SuggestionOption): string => {
    return option.type === 'map' ? option.vehicle.name : option.name;
  }, []);

  // Handle selection
  const handleChange = useCallback(
    (_event: React.SyntheticEvent, option: SuggestionOption | null) => {
      if (!option) return;

      if (option.type === 'map') {
        // Map vehicle: add ID -> name mapping
        const vehicle = option.vehicle;
        if (vehicle.id) {
          onChange({ ...value, [vehicle.id]: vehicle.name });
        }
      } else {
        // Kostenersatz vehicle: trigger callback to add to map first
        onKostenersatzVehicleSelected?.(option.name);
      }

      setInputValue('');
    },
    [value, onChange, onKostenersatzVehicleSelected]
  );

  // Remove a vehicle by ID
  const removeVehicle = useCallback(
    (vehicleId: string) => {
      const updated = { ...value };
      delete updated[vehicleId];
      onChange(updated);
    },
    [value, onChange]
  );

  // Convert value Record to array for display
  const selectedVehicles = useMemo(
    () => Object.entries(value).map(([id, name]) => ({ id, name })),
    [value]
  );

  return (
    <Box>
      {/* Selected vehicles as chips */}
      {selectedVehicles.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
          {selectedVehicles.map(({ id, name }) => (
            <Chip
              key={id}
              label={name}
              size="small"
              variant="outlined"
              onDelete={disabled ? undefined : () => removeVehicle(id)}
              disabled={disabled}
            />
          ))}
        </Box>
      )}

      {/* Autocomplete input */}
      <Autocomplete
        options={options}
        getOptionLabel={getOptionLabel}
        value={null}
        inputValue={inputValue}
        onInputChange={(_event, newInputValue, reason) => {
          if (reason !== 'reset') {
            setInputValue(newInputValue);
          }
        }}
        onChange={handleChange}
        disabled={disabled}
        clearOnBlur={false}
        blurOnSelect
        isOptionEqualToValue={(option, val) => {
          if (option.type === 'map' && val.type === 'map') {
            return option.vehicle.id === val.vehicle.id;
          }
          if (option.type === 'kostenersatz' && val.type === 'kostenersatz') {
            return option.name === val.name;
          }
          return false;
        }}
        renderOption={(props, option) => {
          const name = option.type === 'map' ? option.vehicle.name : option.name;
          const fw = option.type === 'map' ? option.vehicle.fw : undefined;
          const isKostenersatz = option.type === 'kostenersatz';

          return (
            <Box component="li" {...props} key={option.type === 'map' ? option.vehicle.id : option.name}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                <span>{name}</span>
                <Box sx={{ display: 'flex', gap: 1, ml: 1 }}>
                  {fw && (
                    <Typography variant="caption" color="text.secondary">
                      {fw}
                    </Typography>
                  )}
                  {isKostenersatz && (
                    <Typography variant="caption" color="primary">
                      + Karte
                    </Typography>
                  )}
                </Box>
              </Box>
            </Box>
          );
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            variant="standard"
            fullWidth
            size="small"
            placeholder="Fahrzeug hinzufügen..."
          />
        )}
      />
    </Box>
  );
}
```

---

## Task 4: Update EinsatzorteRow Component

**Files:**
- Modify: `src/components/Einsatzorte/EinsatzorteRow.tsx`

**Step 1: Update props interface**

Change lines 24-27 from:
```typescript
  vehicleSuggestions: string[];
  kostenersatzVehicleNames: Set<string>;
  vehicleFwMap?: Map<string, string>;
  onKostenersatzVehicleAdded?: (vehicleName: string, location: FirecallLocation) => void;
```
to:
```typescript
  mapVehicles: Fzg[];
  kostenersatzVehicleNames: Set<string>;
  onKostenersatzVehicleSelected?: (vehicleName: string, location: FirecallLocation) => void;
```

**Step 2: Update imports**

Add `Fzg` to the import from firestore:
```typescript
import { FirecallLocation, LocationStatus, Fzg } from '../firebase/firestore';
```

**Step 3: Update destructured props**

Change lines 36-39 from:
```typescript
  vehicleSuggestions,
  kostenersatzVehicleNames,
  vehicleFwMap,
  onKostenersatzVehicleAdded,
```
to:
```typescript
  mapVehicles,
  kostenersatzVehicleNames,
  onKostenersatzVehicleSelected,
```

**Step 4: Update handleVehiclesChange**

Change lines 240-245 from:
```typescript
  const handleVehiclesChange = useCallback(
    (vehicles: string[]) => {
      handleFieldChange('vehicles', vehicles);
    },
    [handleFieldChange]
  );
```
to:
```typescript
  const handleVehiclesChange = useCallback(
    (vehicles: Record<string, string>) => {
      handleFieldChange('vehicles', vehicles);
    },
    [handleFieldChange]
  );
```

**Step 5: Update handleKostenersatzVehicleAdded**

Change lines 247-255 from:
```typescript
  const handleKostenersatzVehicleAdded = useCallback(
    (vehicleName: string) => {
      if (onKostenersatzVehicleAdded && local.id) {
        // Pass the full location with updated vehicles
        onKostenersatzVehicleAdded(vehicleName, local as FirecallLocation);
      }
    },
    [onKostenersatzVehicleAdded, local]
  );
```
to:
```typescript
  const handleKostenersatzVehicleSelected = useCallback(
    (vehicleName: string) => {
      if (onKostenersatzVehicleSelected && local.id) {
        onKostenersatzVehicleSelected(vehicleName, local as FirecallLocation);
      }
    },
    [onKostenersatzVehicleSelected, local]
  );
```

**Step 6: Remove vehiclesArray useMemo**

Delete lines 257-266 (the `vehiclesArray` useMemo) - no longer needed.

**Step 7: Update VehicleAutocomplete usage**

Change lines 321-328 from:
```typescript
          <VehicleAutocomplete
            value={vehiclesArray}
            onChange={handleVehiclesChange}
            suggestions={vehicleSuggestions}
            kostenersatzVehicleNames={kostenersatzVehicleNames}
            vehicleFwMap={vehicleFwMap}
            onKostenersatzVehicleAdded={handleKostenersatzVehicleAdded}
          />
```
to:
```typescript
          <VehicleAutocomplete
            value={(local.vehicles as Record<string, string>) || {}}
            onChange={handleVehiclesChange}
            mapVehicles={mapVehicles}
            kostenersatzVehicleNames={kostenersatzVehicleNames}
            onKostenersatzVehicleSelected={handleKostenersatzVehicleSelected}
          />
```

**Step 8: Update handleFieldChange type signature**

Change line 157 from:
```typescript
    (field: keyof FirecallLocation, value: string | string[] | LocationStatus) => {
```
to:
```typescript
    (field: keyof FirecallLocation, value: string | Record<string, string> | LocationStatus) => {
```

---

## Task 5: Update EinsatzorteCard Component

**Files:**
- Modify: `src/components/Einsatzorte/EinsatzorteCard.tsx`

Apply the same changes as Task 4:

**Step 1: Update props interface (lines 26-29)**

Change from:
```typescript
  vehicleSuggestions: string[];
  kostenersatzVehicleNames: Set<string>;
  vehicleFwMap?: Map<string, string>;
  onKostenersatzVehicleAdded?: (vehicleName: string, location: FirecallLocation) => void;
```
to:
```typescript
  mapVehicles: Fzg[];
  kostenersatzVehicleNames: Set<string>;
  onKostenersatzVehicleSelected?: (vehicleName: string, location: FirecallLocation) => void;
```

**Step 2: Update imports**

Add `Fzg` to the import from firestore:
```typescript
import { FirecallLocation, LocationStatus, Fzg } from '../firebase/firestore';
```

**Step 3: Update destructured props (lines 38-41)**

Change from:
```typescript
  vehicleSuggestions,
  kostenersatzVehicleNames,
  vehicleFwMap,
  onKostenersatzVehicleAdded,
```
to:
```typescript
  mapVehicles,
  kostenersatzVehicleNames,
  onKostenersatzVehicleSelected,
```

**Step 4: Update handleFieldChange type (line 110)**

Change from:
```typescript
    (field: keyof FirecallLocation, value: string | string[] | LocationStatus) => {
```
to:
```typescript
    (field: keyof FirecallLocation, value: string | Record<string, string> | LocationStatus) => {
```

**Step 5: Update handleVehiclesChange (lines 192-196)**

Change from:
```typescript
  const handleVehiclesChange = useCallback(
    (vehicles: string[]) => {
      handleFieldChange('vehicles', vehicles);
    },
    [handleFieldChange]
  );
```
to:
```typescript
  const handleVehiclesChange = useCallback(
    (vehicles: Record<string, string>) => {
      handleFieldChange('vehicles', vehicles);
    },
    [handleFieldChange]
  );
```

**Step 6: Update handleKostenersatzVehicleAdded (lines 199-206)**

Rename and update:
```typescript
  const handleKostenersatzVehicleSelected = useCallback(
    (vehicleName: string) => {
      if (onKostenersatzVehicleSelected && local.id) {
        onKostenersatzVehicleSelected(vehicleName, local as FirecallLocation);
      }
    },
    [onKostenersatzVehicleSelected, local]
  );
```

**Step 7: Remove vehiclesArray useMemo (lines 209-218)**

Delete the entire `vehiclesArray` useMemo block.

**Step 8: Update VehicleAutocomplete usage (lines 276-283)**

Change from:
```typescript
            <VehicleAutocomplete
              value={vehiclesArray}
              onChange={handleVehiclesChange}
              suggestions={vehicleSuggestions}
              kostenersatzVehicleNames={kostenersatzVehicleNames}
              vehicleFwMap={vehicleFwMap}
              onKostenersatzVehicleAdded={handleKostenersatzVehicleAdded}
            />
```
to:
```typescript
            <VehicleAutocomplete
              value={(local.vehicles as Record<string, string>) || {}}
              onChange={handleVehiclesChange}
              mapVehicles={mapVehicles}
              kostenersatzVehicleNames={kostenersatzVehicleNames}
              onKostenersatzVehicleSelected={handleKostenersatzVehicleSelected}
            />
```

---

## Task 6: Update EinsatzorteTable Component

**Files:**
- Modify: `src/components/Einsatzorte/EinsatzorteTable.tsx`

**Step 1: Update imports**

Add `Fzg` to the import:
```typescript
import { FirecallLocation, defaultFirecallLocation, Fzg } from '../firebase/firestore';
```

**Step 2: Update props interface (lines 19-22)**

Change from:
```typescript
  vehicleSuggestions: string[];
  kostenersatzVehicleNames: Set<string>;
  vehicleFwMap?: Map<string, string>;
  onKostenersatzVehicleAdded?: (vehicleName: string, location: FirecallLocation) => void;
```
to:
```typescript
  mapVehicles: Fzg[];
  kostenersatzVehicleNames: Set<string>;
  onKostenersatzVehicleSelected?: (vehicleName: string, location: FirecallLocation) => void;
```

**Step 3: Update destructured props (lines 31-33)**

Change from:
```typescript
  vehicleSuggestions,
  kostenersatzVehicleNames,
  vehicleFwMap,
  onKostenersatzVehicleAdded,
```
to:
```typescript
  mapVehicles,
  kostenersatzVehicleNames,
  onKostenersatzVehicleSelected,
```

**Step 4: Update EinsatzorteRow props (lines 79-82)**

Change from:
```typescript
              vehicleSuggestions={vehicleSuggestions}
              kostenersatzVehicleNames={kostenersatzVehicleNames}
              vehicleFwMap={vehicleFwMap}
              onKostenersatzVehicleAdded={onKostenersatzVehicleAdded}
```
to:
```typescript
              mapVehicles={mapVehicles}
              kostenersatzVehicleNames={kostenersatzVehicleNames}
              onKostenersatzVehicleSelected={onKostenersatzVehicleSelected}
```

**Step 5: Update new row EinsatzorteRow props (lines 91-94)**

Same change as Step 4.

---

## Task 7: Update Einsatzorte Page Component

**Files:**
- Modify: `src/components/pages/Einsatzorte.tsx`

**Step 1: Update useVehicleSuggestions destructuring (lines 42-43)**

Change from:
```typescript
  const { suggestions: vehicleSuggestions, kostenersatzVehicleNames, vehicleFwMap } =
    useVehicleSuggestions(firecallVehicles);
```
to:
```typescript
  const { mapVehicles, kostenersatzVehicleNames } =
    useVehicleSuggestions(firecallVehicles);
```

**Step 2: Update handleKostenersatzVehicleAdded to capture new vehicle ID**

Replace lines 110-173 with:

```typescript
  /**
   * Called when a Kostenersatz vehicle is selected for a location.
   * Creates or finds the vehicle on the map, then adds its ID to the location.
   */
  const handleKostenersatzVehicleSelected = useCallback(
    async (vehicleName: string, location: FirecallLocation) => {
      // Determine position: use Einsatzort coordinates, fallback to firecall position
      const lat = location.lat ?? firecall?.lat;
      const lng = location.lng ?? firecall?.lng;

      if (lat === undefined || lng === undefined) {
        console.warn(
          `Cannot place vehicle "${vehicleName}": no coordinates available for location or firecall`
        );
        return;
      }

      // Check if vehicle already exists in firecall items (by name match)
      const existingVehicle = firecallVehicles.find(
        (v) => v.name.toLowerCase() === vehicleName.toLowerCase()
      );

      try {
        let vehicleId: string;
        let vehicleDisplayName: string;

        if (existingVehicle && existingVehicle.id) {
          // Vehicle exists: update position and use existing ID
          vehicleId = existingVehicle.id;
          vehicleDisplayName = existingVehicle.name;

          console.info(
            `Updating existing vehicle "${vehicleName}" position to ${lat}, ${lng}`
          );

          await saveHistory(`Fahrzeug ${vehicleName} Positionsupdate`);
          await updateFirecallItem({
            ...existingVehicle,
            lat,
            lng,
          });

          setSnackbar(`${vehicleName} Position aktualisiert`);
        } else {
          // Vehicle doesn't exist: create new vehicle item
          console.info(
            `Creating new vehicle "${vehicleName}" at position ${lat}, ${lng}`
          );

          const newVehicle: Fzg = {
            name: vehicleName,
            type: 'vehicle',
            fw: 'Neusiedl am See',
            lat,
            lng,
          };

          const docRef = await addFirecallItem(newVehicle);
          vehicleId = docRef.id;
          vehicleDisplayName = vehicleName;

          setSnackbar(`${vehicleName} auf Karte hinzugefügt`);
        }

        // Now add the vehicle reference to the location
        const currentVehicles = (location.vehicles as Record<string, string>) || {};
        if (!currentVehicles[vehicleId]) {
          await updateLocation(location.id!, {
            vehicles: { ...currentVehicles, [vehicleId]: vehicleDisplayName },
          });
        }
      } catch (error) {
        console.error(`Failed to add/update vehicle "${vehicleName}":`, error);
        setSnackbar(`Fehler beim Aktualisieren von ${vehicleName}`);
      }
    },
    [firecall, firecallVehicles, addFirecallItem, updateFirecallItem, saveHistory, updateLocation]
  );
```

**Step 3: Update EinsatzorteCard props (lines 234-237)**

Change from:
```typescript
              vehicleSuggestions={vehicleSuggestions}
              kostenersatzVehicleNames={kostenersatzVehicleNames}
              vehicleFwMap={vehicleFwMap}
              onKostenersatzVehicleAdded={handleKostenersatzVehicleAdded}
```
to:
```typescript
              mapVehicles={mapVehicles}
              kostenersatzVehicleNames={kostenersatzVehicleNames}
              onKostenersatzVehicleSelected={handleKostenersatzVehicleSelected}
```

**Step 4: Update new card EinsatzorteCard props (lines 246-249)**

Same change as Step 3.

**Step 5: Update EinsatzorteTable props (lines 258-261)**

Change from:
```typescript
          vehicleSuggestions={vehicleSuggestions}
          kostenersatzVehicleNames={kostenersatzVehicleNames}
          vehicleFwMap={vehicleFwMap}
          onKostenersatzVehicleAdded={handleKostenersatzVehicleAdded}
```
to:
```typescript
          mapVehicles={mapVehicles}
          kostenersatzVehicleNames={kostenersatzVehicleNames}
          onKostenersatzVehicleSelected={handleKostenersatzVehicleSelected}
```

---

## Task 8: Build and Test

**Step 1: Run TypeScript build**

Run: `npm run build`
Expected: Build succeeds with no type errors

**Step 2: Run lint**

Run: `npm run lint`
Expected: No lint errors

**Step 3: Manual testing checklist**

- [ ] Open Einsatzorte page
- [ ] Verify existing map vehicles appear in autocomplete
- [ ] Select a map vehicle → verify it's added to location
- [ ] Verify chip displays vehicle name
- [ ] Remove a vehicle → verify chip disappears
- [ ] Select a Kostenersatz vehicle → verify it's added to map AND to location
- [ ] Verify vehicle data in Firestore shows `vehicles: { "docId": "VehicleName" }`

---

## Task 9: Commit

**Step 1: Stage and commit**

```bash
git add src/components/firebase/firestore.ts \
        src/hooks/useVehicleSuggestions.ts \
        src/components/Einsatzorte/VehicleAutocomplete.tsx \
        src/components/Einsatzorte/EinsatzorteRow.tsx \
        src/components/Einsatzorte/EinsatzorteCard.tsx \
        src/components/Einsatzorte/EinsatzorteTable.tsx \
        src/components/pages/Einsatzorte.tsx
git commit -m "feat(einsatzorte): use vehicle ID references instead of names

Change FirecallLocation.vehicles from string[] to Record<string, string>
where key is Fzg document ID and value is vehicle name (fallback display).

All vehicles must exist on the map - Kostenersatz vehicles are created
on the map first, then referenced by their new ID."
```
