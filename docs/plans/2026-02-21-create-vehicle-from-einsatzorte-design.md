# Create New Vehicles from Einsatzorte Autocomplete

**Date:** 2026-02-21

## Overview

Add a "create new vehicle" option to the Einsatzorte vehicle autocomplete that appears when the typed text doesn't match existing vehicles. Selecting it creates a Fzg item immediately with auto-split name/fw and assigns it to the location.

## Data Flow

```
User types "RLFA Gols" → no match found →
  dropdown shows "+ Neu: RLFA Gols" option →
    user clicks it →
      split: name="RLFA", fw="Gols" →
        new callback onCreateVehicle("RLFA", "Gols") fires →
          Einsatzorte.tsx handler:
            1. addFirecallItem({ name, fw, type: "vehicle", lat, lng })
            2. Add vehicle ref to location.vehicles
            3. Create diary entry
```

Same workflow as `handleKostenersatzVehicleSelected` — vehicle is created and assigned to the location in one action.

## Auto-split Rules

- Input split on first space: first word = `name`, rest = `fw`
- Single word input (e.g. "RLFA"): `name="RLFA"`, `fw=""`
- Examples:
  - "RLFA Gols" → name="RLFA", fw="Gols"
  - "TLF 3000 Weiden" → name="TLF", fw="3000 Weiden"
  - "KDO" → name="KDO", fw=""

## Changes by File

### VehicleAutocomplete.tsx

- Add `type: 'create'` variant to `SuggestionOption` with `name` and `fw` fields
- New prop: `onCreateVehicle?: (name: string, fw: string) => void`
- Use MUI `filterOptions` to append a create option when input has no exact match
- Render with `"+ Neu: RLFA Gols"` label and primary color styling
- On selection, split input and call `onCreateVehicle`

### Einsatzorte.tsx

- New handler `handleCreateVehicle(name, fw)`:
  1. Create Fzg item via `addFirecallItem` with location coordinates
  2. Add vehicle ID to `location.vehicles`
  3. Create Einsatztagebuch diary entry

### EinsatzorteCard.tsx, EinsatzorteRow.tsx

- Pass through `onCreateVehicle` callback to `VehicleAutocomplete`

## UX Details

- Create option appears only when input is non-empty and doesn't exactly match an existing option
- Rendered at bottom of dropdown with "+" prefix and primary color
- After creation, input clears and vehicle appears as chip (same as existing flow)
