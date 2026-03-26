# Hydranten CSV Import — Design

## Overview

New admin tab "Hydranten CSV Import" for uploading WLV (Wasserleitungsverband) CSV files to update/add hydrant records in Firestore. Handles field mapping, coordinate conversion, duplicate detection, and merge-import preserving existing fields like `leistung`.

## Architecture

- **UI Component**: `src/components/admin/HydrantenCsvImport.tsx`
- **Server Action**: `src/app/admin/hydrantenCsvImportAction.ts`
- **Admin Tab**: Added to `AdminTabs.tsx` as "Hydranten CSV Import"
- No new API route — uses Server Actions per project conventions

## CSV Format (WLV)

Source: Wasserleitungsverband Nördl. Burgenland export. Characteristics:
- Row 1: Header
- Row 2: Description/units row (must be skipped)
- Row 3+: Data
- Decimal separator: comma (e.g., `"5,1"`)
- Coordinates: GK M34 (EPSG:31256)
- `Gemeinde-WZ` values: `---` or empty = NEIN, `ja` = JA

## Field Mapping

| CSV Column | Target Field | Transform |
|---|---|---|
| `Ortsnetz / Versorgungseinheit` | `ortschaft` | direct |
| `ART` | `typ` | direct |
| `Hydranten-Nr.` | `hydranten_nummer` | direct |
| `Gemeinde-WZ` | `fuellhydrant` | `---`/empty -> `NEIN`, `ja` -> `JA` |
| `Dimension` | `dimension` | parse number |
| `Leitungsart` | `leitungsart` | direct |
| `Stat. Druck` | `statischer_druck` | parse number (comma -> dot) |
| `Dyn. Druck` | `dynamischer_druck` | parse number (comma -> dot) |
| `Druck gemessen am` | `druckmessung_datum` | direct (date string) |
| `GOK` | `meereshoehe` | parse number (comma -> dot) |
| `X-Koordinate` | -> `lat`/`lng` | GK M34 -> WGS84 via `gk34ToWgs84` |
| `Y-Koordinate` | -> `lat`/`lng` | GK M34 -> WGS84 via `gk34ToWgs84` |
| `Wasserversorger` | — | ignored |

## Document Key Generation

```
${ortschaft}_${hydranten_nummer}  (lowercase, non-alphanumeric -> _)
```

Example: `Neusiedl` + `HY1` -> `neusiedl_hy1`

## Matching Logic

1. Load all documents from `hydrant` collection
2. Build index: `hydranten_nummer` (lowercase) + `ortschaft` (lowercase) -> doc ID
3. Check ortschaft aliases (e.g., `ND` = `Neusiedl`) for duplicate detection
4. For each CSV record:
   - Match with same key -> **Update** (merge write)
   - Match with different key (alias ortschaft) -> **Update** new key + **Delete** old key (duplicate cleanup)
   - No match -> **New** (create)

### Ortschaft Alias Detection

Rather than hardcoding aliases, the system detects duplicates by matching `hydranten_nummer` across ortschaften where coordinates are within ~100m of each other. This handles cases like `ND` being an alias for `Neusiedl` without configuration.

## Import Steps (UI)

1. **CSV Upload + Parse** — Upload file, skip description row, convert decimal commas, map fields
2. **Coordinate Conversion** — GK M34 -> WGS84, compute geohash
3. **Matching + Preview** — Load existing Firestore data, match, show preview table with status (New/Update/Duplicate). Filterable by status. Summary: X new, Y updated, Z duplicates to clean up
4. **Import** — User confirms. Merge-write new/updated records (preserves existing fields like `leistung`), delete duplicate docs

## Data Preservation

- `leistung`: Preserved from existing records (not in CSV)
- `geohash`: Recomputed from new coordinates
- `name`: Set to document key (e.g., `neusiedl_hy1`)
- All other existing fields not in CSV are preserved via Firestore merge write

## Components

### HydrantenCsvImport.tsx
- File upload (reuse existing `FileUpload` component, accept `.csv`)
- Progress stepper (reuse existing `ProgressStepper`)
- Preview table (reuse existing `DataPreview` or custom with status column)
- Import confirmation with summary counts

### hydrantenCsvImportAction.ts
Server actions:
- `parseHydrantenCsv(formData)` — Parse CSV, map fields, convert coordinates, return parsed records
- `matchHydrantenRecords(records)` — Load existing Firestore data, compute matches, return match results
- `importHydrantenRecords(records, duplicatesToDelete)` — Merge-write records, delete duplicates
