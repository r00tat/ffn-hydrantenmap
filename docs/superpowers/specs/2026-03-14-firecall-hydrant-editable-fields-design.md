# Firecall Hydrant Editable Fields

## Problem

When a user creates a new hydrant firecall item (via "Add item" → type "hydrant"), only `name` and `beschreibung` are editable. The hydrant-specific fields from the `hydrant` collection schema are not exposed in the edit dialog.

## Solution

Add `fields()`, `fieldTypes()`, and `selectValues()` overrides to `FirecallHydrant` class, following the same pattern used by `FirecallVehicle` and other firecall item types. Set `editable: true`.

## Changes

**Single file:** `src/components/FirecallItems/elements/FirecallHydrant.tsx`

### Fields exposed in edit dialog

| Field | Label | Input Type |
|-------|-------|------------|
| `name` | Name | text |
| `ortschaft` | Ortschaft | text |
| `typ` | Typ | select (Überflurhydrant, Unterflurhydrant) |
| `hydranten_nummer` | Hydrantennummer | text |
| `fuellhydrant` | Füllhydrant | select (ja, nein) |
| `dimension` | Dimension (mm) | number |
| `leitungsart` | Leitungsart | text |
| `statischer_druck` | Statischer Druck (bar) | number |
| `dynamischer_druck` | Dynamischer Druck (bar) | number |
| `leistung` | Leistung (l/min) | text |
| `beschreibung` | Beschreibung | textarea |

### Fields intentionally excluded

- `meereshoehe` — not relevant for user-created hydrants
- `druckmessung_datum` — not relevant for user-created hydrants
- `geohash` — computed value, not user-editable

### Scope

- Hydrant firecall items are saved only to `call/{firecallId}/item/{docId}`, not to the `hydrant` collection.
- All fields are optional.
