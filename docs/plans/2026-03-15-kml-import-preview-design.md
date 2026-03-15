# KML Import Preview UI — Design Doc

**Date:** 2026-03-15
**Branch:** feature/kml-import-preview

## Problem

The KML import (`KmlImport.tsx`) silently parses a file and creates items with no user confirmation or visibility into what was found. The CSV import (`CsvImport.tsx`) provides a preview dialog with statistics, field mapping, and a schema editor. The KML import should offer equivalent transparency.

## Goal

Add a preview dialog to `KmlImport.tsx` that shows the user what was found in the KML file and allows editing the field schema before committing the import.

## Chosen Approach

Single dialog, one shared schema — mirrors the CSV import UI. One schema applies to all geometry types (same as the current silent KML import already does). Maximum code reuse with existing components.

## Dialog Design

**Trigger:** File selected → KML parsed → dialog opens.
**Confirm:** User clicks "Importieren" → existing item creation logic runs with user-edited state.

### Dialog Contents (top to bottom)

1. **Layer name** — editable `TextField`, pre-filled from filename (e.g. `my-route.kml` → `"my-route"`)
2. **Item counts** — MUI chip row showing counts per geometry type, only types present are shown:
   - `12 Punkte` (Points → markers)
   - `3 Linien` (LineStrings → lines)
   - `1 Fläche` (Polygons → areas)
3. **DataSchemaEditor** — same component used in CSV import; populated from `generateSchemaFromFeatures()`; user can rename labels, change types, reorder or remove fields
4. **Action buttons** — "Abbrechen" / "Importieren"

## Implementation

### Changes to `KmlImport.tsx`

**Extract parsing into helper:**
```ts
function parseKml(text: string): {
  features: GeoJSON.Feature[];
  schema: DataSchemaField[];
  headerToSchemaKey: Map<string, string>;
}
```
This contains the existing `toGeoJSON`, `generateSchemaFromFeatures` logic currently inlined in the file handler.

**Add dialog state:**
```ts
const [open, setOpen] = useState(false);
const [layerName, setLayerName] = useState('');
const [schema, setSchema] = useState<DataSchemaField[]>([]);
const [features, setFeatures] = useState<GeoJSON.Feature[]>([]);
const [headerToSchemaKey, setHeaderToSchemaKey] = useState<Map<string, string>>(new Map());
```

**File select handler:**
1. Read file text (unchanged)
2. Call `parseKml(text)` → set state
3. Set `layerName` from filename (strip `.kml` extension)
4. `setOpen(true)`

**Import handler (on dialog confirm):**
- Uses `schema`, `layerName`, `features`, `headerToSchemaKey` from state
- Existing geometry processing logic (Point → marker, LineString → line, Polygon → area) runs unchanged

**Type counts:**
```ts
const counts = features.reduce(
  (acc, f) => {
    const t = f.geometry.type as 'Point' | 'LineString' | 'Polygon';
    acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  },
  {} as Record<string, number>
);
```

### No New Files

- `DataSchemaEditor` — already importable from `src/components/FirecallItems/DataSchemaEditor.tsx`
- `generateSchemaFromFeatures` — already exported from `src/components/firebase/KmlImport.tsx` (or `importUtils.ts`)
- Dialog uses same MUI `Dialog` / `DialogContent` / `DialogActions` pattern as `CsvImport.tsx`

### `headerToSchemaKey` Thread-Through

Passed from parse step through to the import step so property→field mapping survives any user edits to labels/keys — same pattern as `CsvImport.tsx`.

## Out of Scope

- Per-type schemas (one schema per geometry type) — over-engineered for this use case
- Two-step wizard — extra clicks with no benefit
- Downsampling slider — not relevant for KML (unlike high-frequency GPS CSV tracks)

## Files Changed

| File | Change |
|------|--------|
| `src/components/firebase/KmlImport.tsx` | Refactor: extract parse helper, add dialog state + UI |
