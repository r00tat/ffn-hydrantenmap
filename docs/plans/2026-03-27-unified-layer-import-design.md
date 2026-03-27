# Unified Layer Import with GPX Support

## Summary

Combine KML, CSV, and GPX import into a single unified import component. One "Importieren" button accepts all file types, auto-detects the format, and shows a preview dialog with format-specific UI sections.

## Motivation

- Adding GPX import (for RadiaCode tracks, GPS tracks, waypoints, routes)
- Three separate import buttons clutter the Layers page header
- The three importers share most of their logic and UI (layer name, type chips, schema editor, import action)

## Design

### Entry Point

Single **"Importieren"** button on Layers page replacing `<KmlImport />` and `<CsvImport />`. Accepts `.kml`, `.gpx`, `.csv`, `.tsv`, `.txt`.

### File Type Detection

By extension: `.kml` → KML parser, `.gpx` → GPX parser, `.csv`/`.tsv`/`.txt` → CSV parser.

### GPX Parsing

GPX → GeoJSON via `@mapbox/togeojson`'s `gpx()` (already in the project). Handles all three GPX element types:

- **Tracks (`trk`)** → GeoJSON `LineString` → firecall `line`
- **Routes (`rte`)** → GeoJSON `LineString` → firecall `line`
- **Waypoints (`wpt`)** → GeoJSON `Point` → firecall `marker`

### Dialog Structure

**Common sections (all formats):**
- Dialog title: "Import: {filename}"
- Layer name text field
- Type count chips (Punkte, Linien, Flächen)
- DataSchemaEditor for extra fields
- Import button with count

**CSV-only sections:**
- Delimiter selector
- Header row selector
- Pre-header metadata + checkbox
- Column mapping (lat/lng/name/timestamp)
- Extra columns checkboxes
- Downsampling slider

KML and GPX show only the common sections.

### File Changes

| File | Change |
|------|--------|
| `src/components/firebase/LayerImport.tsx` | **New** — unified component |
| `src/components/firebase/gpxParser.ts` | **New** — GPX→GeoJSON thin wrapper |
| `src/components/firebase/geoJsonImport.ts` | **New** — extracted shared logic from KmlImport (`generateSchemaFromFeatures`, `parseGeoJson`, `TYPE_LABELS`) |
| `src/components/firebase/KmlImport.tsx` | **Delete** — absorbed into LayerImport |
| `src/components/firebase/CsvImport.tsx` | **Delete** — absorbed into LayerImport |
| `src/components/pages/Layers.tsx` | Replace `<KmlImport /><CsvImport />` with `<LayerImport />` |

### Flow

```
User clicks "Importieren" → selects file
  → detect format by extension
  → parse (KML: togeojson.kml, GPX: togeojson.gpx, CSV: csvParser)
  → show unified dialog with format-specific sections
  → user edits schema/settings
  → import creates layer + items via useFirecallItemAdd
```
