# Create New Vehicles from Einsatzorte Autocomplete - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to create new vehicles directly from the Einsatzorte autocomplete when the typed name doesn't match any existing option.

**Architecture:** Extend `VehicleAutocomplete` with a `type: 'create'` suggestion option and MUI `filterOptions`. The parent `Einsatzorte.tsx` handles creation using the same pattern as `handleKostenersatzVehicleSelected`. Passthrough props added in `EinsatzorteCard`, `EinsatzorteRow`, and `EinsatzorteTable`.

**Tech Stack:** React 19, MUI Autocomplete `filterOptions`, TypeScript

---

### Task 1: Add `create` option type to VehicleAutocomplete

**Files:**
- Modify: `src/components/Einsatzorte/VehicleAutocomplete.tsx`

**Step 1: Add `create` variant to `SuggestionOption` type and new prop**

In `VehicleAutocomplete.tsx`, extend the union type at line 27-33 and add `onCreateVehicle` prop:

```typescript
type SuggestionOption = {
  type: 'map';
  vehicle: Fzg;
} | {
  type: 'kostenersatz';
  name: string;
} | {
  type: 'create';
  inputValue: string;
};
```

Add to `VehicleAutocompleteProps` interface (after line 24):

```typescript
  /** Called when user creates a new vehicle from typed input */
  onCreateVehicle?: (name: string, fw: string) => void;
```

Add to the destructured props (after `onMapVehicleSelected`):

```typescript
  onCreateVehicle,
```

**Step 2: Add `filterOptions` to inject the create option**

Add a `filterOptions` callback after the existing `options` memo (after line 75):

```typescript
  const filterOptions = useCallback(
    (options: SuggestionOption[], state: { inputValue: string }): SuggestionOption[] => {
      const input = state.inputValue.trim();
      if (!input) return options;

      const inputLower = input.toLowerCase();

      // Filter options that match the input
      const filtered = options.filter((option) => {
        const label = option.type === 'map' ? option.vehicle.name : option.type === 'kostenersatz' ? option.name : '';
        return label.toLowerCase().includes(inputLower);
      });

      // Check if any option is an exact match
      const hasExactMatch = options.some((option) => {
        const label = option.type === 'map' ? option.vehicle.name : option.type === 'kostenersatz' ? option.name : '';
        return label.toLowerCase() === inputLower;
      });

      // Append create option if no exact match
      if (!hasExactMatch && onCreateVehicle) {
        filtered.push({ type: 'create', inputValue: input });
      }

      return filtered;
    },
    [onCreateVehicle]
  );
```

Add import for `createFilterOptions` — actually, we don't need it since we're writing custom `filterOptions` directly. No additional imports needed.

**Step 3: Handle create option selection**

In `handleChange` (line 83-105), add a case for `type: 'create'`:

After the `else` block at line 97-100, add:

```typescript
      } else if (option.type === 'create') {
        // Split input: first word = name, rest = fw
        const parts = option.inputValue.split(/\s+/);
        const name = parts[0];
        const fw = parts.slice(1).join(' ');
        onCreateVehicle?.(name, fw);
      }
```

**Step 4: Update `getOptionLabel` to handle create type**

Replace the `getOptionLabel` callback (line 78-80):

```typescript
  const getOptionLabel = useCallback((option: SuggestionOption): string => {
    if (option.type === 'create') return option.inputValue;
    return option.type === 'map' ? option.vehicle.name : option.name;
  }, []);
```

**Step 5: Update `renderOption` to style the create option**

In `renderOption` (line 165-189), add handling for the create type. Replace the function body:

```typescript
        renderOption={(props, option) => {
          if (option.type === 'create') {
            return (
              <Box component="li" {...props} key="__create__">
                <Typography color="primary">+ Neu: {option.inputValue}</Typography>
              </Box>
            );
          }

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
```

**Step 6: Pass `filterOptions` to the Autocomplete**

Add the `filterOptions` prop to the `<Autocomplete>` element (after `clearOnBlur={false}` at line 154):

```typescript
        filterOptions={filterOptions}
```

**Step 7: Update `isOptionEqualToValue` to handle create type**

Add a case at the end of `isOptionEqualToValue` (before the `return false`):

```typescript
          if (option.type === 'create' && val.type === 'create') {
            return option.inputValue === val.inputValue;
          }
```

**Step 8: Verify build**

Run: `npm run build`
Expected: Build succeeds with no type errors

**Step 9: Commit**

```bash
git add src/components/Einsatzorte/VehicleAutocomplete.tsx
git commit -m "feat: add create-new-vehicle option to VehicleAutocomplete"
```

---

### Task 2: Add `handleCreateVehicle` handler in Einsatzorte.tsx

**Files:**
- Modify: `src/components/pages/Einsatzorte.tsx`

**Step 1: Add the handler**

After `handleMapVehicleSelected` (after line 353), add:

```typescript
  const handleCreateVehicle = useCallback(
    async (name: string, fw: string, location: FirecallLocation) => {
      const lat = location.lat ?? firecall?.lat;
      const lng = location.lng ?? firecall?.lng;

      if (lat === undefined || lng === undefined) {
        console.warn(
          `Cannot place vehicle "${name}": no coordinates available for location or firecall`
        );
        return;
      }

      try {
        const locationDisplayName = getLocationDisplayName(location);
        await saveHistory(`Status vor ${name} zu Einsatzort ${locationDisplayName} zugeordnet`);

        const newVehicle: Fzg = {
          name,
          type: 'vehicle',
          fw: fw || undefined,
          lat,
          lng,
        };

        const docRef = await addFirecallItem(newVehicle);
        const vehicleId = docRef.id;

        const vehicleDisplayName = fw ? `${name} ${fw}` : name;
        setSnackbar(`${vehicleDisplayName} erstellt`);

        // Add vehicle reference to the location
        const currentVehicles = (location.vehicles as Record<string, string>) || {};
        if (!currentVehicles[vehicleId]) {
          await updateLocation(location.id!, {
            vehicles: { ...currentVehicles, [vehicleId]: vehicleDisplayName },
          });
        }

        addDiaryEntry(
          `${vehicleDisplayName} zu Einsatzort ${locationDisplayName} zugeordnet`
        );
      } catch (error) {
        console.error(`Failed to create vehicle "${name}":`, error);
        setSnackbar(`Fehler beim Erstellen von ${name}`);
      }
    },
    [firecall, addFirecallItem, saveHistory, updateLocation, addDiaryEntry]
  );
```

**Step 2: Pass to EinsatzorteCard and EinsatzorteTable**

Add `onCreateVehicle={handleCreateVehicle}` to both `<EinsatzorteCard>` instances (lines 409-418 and 420-430) and to `<EinsatzorteTable>` (lines 433-445).

For the mobile cards (both the map and new):
```typescript
  onCreateVehicle={handleCreateVehicle}
```

For the table:
```typescript
  onCreateVehicle={handleCreateVehicle}
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Type errors in EinsatzorteCard, EinsatzorteRow, EinsatzorteTable (they don't accept the prop yet). That's expected — we fix them in Task 3.

**Step 4: Commit** (after Task 3 is complete — commit together)

---

### Task 3: Thread `onCreateVehicle` through EinsatzorteTable, EinsatzorteCard, and EinsatzorteRow

**Files:**
- Modify: `src/components/Einsatzorte/EinsatzorteTable.tsx`
- Modify: `src/components/Einsatzorte/EinsatzorteCard.tsx`
- Modify: `src/components/Einsatzorte/EinsatzorteRow.tsx`

**Step 1: EinsatzorteTable — add prop and pass through**

Add to `EinsatzorteTableProps` interface (after line 33):
```typescript
  onCreateVehicle?: (name: string, fw: string, location: FirecallLocation) => void;
```

Add to destructured props (after `onMapVehicleSelected`):
```typescript
  onCreateVehicle,
```

Add to both `<EinsatzorteRow>` instances (lines 147-156 and 158-168):
```typescript
  onCreateVehicle={onCreateVehicle}
```

**Step 2: EinsatzorteRow — add prop, create local handler, pass to VehicleAutocomplete**

Add to `EinsatzorteRowProps` interface (after line 27):
```typescript
  onCreateVehicle?: (name: string, fw: string, location: FirecallLocation) => void;
```

Add to destructured props (after `onMapVehicleSelected`):
```typescript
  onCreateVehicle,
```

Add local handler (after `handleMapVehicleSelected`, after line 263):
```typescript
  const handleCreateVehicle = useCallback(
    (name: string, fw: string) => {
      if (onCreateVehicle && local.id) {
        onCreateVehicle(name, fw, local as FirecallLocation);
      }
    },
    [onCreateVehicle, local]
  );
```

Add to `<VehicleAutocomplete>` (after `onMapVehicleSelected` prop):
```typescript
  onCreateVehicle={handleCreateVehicle}
```

**Step 3: EinsatzorteCard — add prop, create local handler, pass to VehicleAutocomplete**

Add to `EinsatzorteCardProps` interface (after line 29):
```typescript
  onCreateVehicle?: (name: string, fw: string, location: FirecallLocation) => void;
```

Add to destructured props (after `onMapVehicleSelected`):
```typescript
  onCreateVehicle,
```

Add local handler (after `handleMapVehicleSelected`, after line 215):
```typescript
  const handleCreateVehicle = useCallback(
    (name: string, fw: string) => {
      if (onCreateVehicle && local.id) {
        onCreateVehicle(name, fw, local as FirecallLocation);
      }
    },
    [onCreateVehicle, local]
  );
```

Add to `<VehicleAutocomplete>` (after `onMapVehicleSelected` prop):
```typescript
  onCreateVehicle={handleCreateVehicle}
```

**Step 4: Build and verify**

Run: `npm run build`
Expected: Build succeeds, no type errors

**Step 5: Commit Tasks 2 and 3 together**

```bash
git add src/components/pages/Einsatzorte.tsx src/components/Einsatzorte/EinsatzorteTable.tsx src/components/Einsatzorte/EinsatzorteCard.tsx src/components/Einsatzorte/EinsatzorteRow.tsx
git commit -m "feat: create new vehicles from Einsatzorte autocomplete

When a typed vehicle name doesn't match any existing option, a '+ Neu'
option appears. Selecting it auto-splits the input (first word = name,
rest = Feuerwehr), creates the vehicle, and assigns it to the location."
```

---

### Task 4: Lint check and final verification

**Files:** None (verification only)

**Step 1: Run lint**

Run: `npm run lint`
Expected: No new lint errors

**Step 2: Run build**

Run: `npm run build`
Expected: Clean build with no errors

**Step 3: Fix any issues found, commit if needed**
