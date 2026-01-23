# Admin Data Import UI Design

## Overview

Move CLI data import scripts (extract, import, clusterHydrants, updateClusters, exportImport) to the admin page, allowing execution from the web UI instead of locally via npm commands.

## Current Scripts

| Script | Input | Operation |
|--------|-------|-----------|
| extract | HAR file + ortschaft prefix | Parse GIS HAR → CSV with WGS84 coords |
| import | collection name + CSV | Import CSV to Firestore |
| exportImport | ortschaft + HAR file + collection | Combined: HAR → parse → import to Firestore |
| clusterHydrants | collection name + CSV | Convert hydrant CSV → geohash clusters → Firestore |
| updateClusters | None | Rebuild clusters from existing Firestore data |

## Design Decisions

- **File handling**: Direct browser upload, processed server-side
- **UI organization**: Tabbed interface with similar operations grouped by use case
- **Progress feedback**: Progress bar with discrete steps
- **Extract output**: Preview data, then continue to import
- **Location**: Redesign existing `/admin` page with tabs for all functionality
- **Error handling**: Inline error message with retry option
- **Data merge**: Use Firestore `{ merge: true }` to preserve manually-added fields (like `link` on risikoobjekte)

## Tab Structure

### Tab 1: Admin Actions (Existing)

Contains current admin functionality:
- Fix Users Authorized
- Fix Empty Firecall Group
- Set Custom Claims

No logic changes, just reorganized into tabbed layout.

### Tab 2: GIS Data Pipeline

Single unified workflow: HAR → Preview → Import

**Inputs:**
- File input for HAR file
- Text field for "Ortschaft" prefix (default: "ND")
- Text field for target collection name (e.g., "hydrant", "risikoobjekt")
- "Start Pipeline" button

**Progress Stepper (4 steps):**
1. **Parsing HAR** - Reading and extracting GIS records from HAR file
2. **Converting Coordinates** - Transforming to WGS84 lat/lng
3. **Preview** - Displays first 20 rows in a table, user reviews data (pipeline pauses here)
4. **Importing to Firestore** - Writing records with merge to preserve existing fields

**Preview Step:**
- Shows data preview table with key columns (name, lat, lng, ortschaft)
- Shows total record count
- Two buttons: "Cancel" (abort) and "Continue Import" (proceed to step 4)
- Optional: "Download CSV" button for local copy

**On Completion:**
- Success message with count of imported records
- "Run Another" button to reset the form

### Tab 3: Hydrant Clusters

Two operations:

**1. Cluster Hydrants from CSV**
- File input for hydrant CSV file
- Text field for target collection name (default: "clusters6")
- "Generate Clusters" button
- Progress: Parsing CSV → Converting coordinates → Generating geohashes → Writing to Firestore
- Shows count of clusters generated

**2. Update Clusters from Existing Data**
- No file input - reads from Firestore
- "Update Clusters" button
- Progress: Fetching existing clusters → Fetching collections (hydrant, risikoobjekt, gefahrobjekt, loeschteich, saugstelle) → Merging data → Writing to Firestore
- Shows count of updated clusters

## Technical Implementation

### API Routes

Each operation needs an API route that streams progress:

- `src/app/api/admin/extract-import/route.ts` - HAR → Preview → Import pipeline
- `src/app/api/admin/cluster-hydrants/route.ts` - CSV → geohash clusters
- `src/app/api/admin/update-clusters/route.ts` - Rebuild clusters from Firestore

### Progress Streaming

API routes return newline-delimited JSON (NDJSON) with progress events:

```json
{"step": 1, "status": "in_progress", "message": "Parsing HAR..."}
{"step": 1, "status": "completed", "count": 150}
{"step": 2, "status": "in_progress", "message": "Converting coordinates..."}
{"step": 3, "status": "paused", "preview": [...first 20 rows...], "total": 150}
```

Client uses `fetch` with streaming response, updates React state on each line.

### Preview Pause Point

When step 3 (preview) is reached, stream pauses. User reviews data and clicks "Continue" which sends a follow-up request to complete the import.

### Error Handling

On error, stream includes:
```json
{"step": 2, "status": "error", "error": "Failed to convert: invalid coordinates"}
```

UI shows error inline below the failed step with "Retry" button.

### Merge Behavior

Import uses Firestore's merge option to preserve manually-added fields:

```typescript
batch.set(collection.doc(id), record, { merge: true });
```

This ensures fields like `link` on risikoobjekte are not overwritten during re-imports.

### ID Generation

Document IDs derived from record data (existing logic):
- If `name` starts with `ortschaft`: use `name.toLowerCase()`
- Otherwise: `${ortschaft}${name}`.toLowerCase().replace(/[^a-z0-9_-]+/g, '_')

## Components

### New Components

- `src/components/admin/AdminTabs.tsx` - Main tabbed container
- `src/components/admin/GisDataPipeline.tsx` - Tab 2 content
- `src/components/admin/HydrantClusters.tsx` - Tab 3 content
- `src/components/admin/ProgressStepper.tsx` - Reusable progress display
- `src/components/admin/DataPreview.tsx` - Table preview of parsed data
- `src/components/admin/FileUpload.tsx` - File input with drag-drop support

### Existing Components (Moved)

Current admin page content moves into Tab 1 (Admin Actions).

## File Structure

```
src/
├── app/
│   ├── admin/
│   │   └── page.tsx (redesigned with tabs)
│   └── api/
│       └── admin/
│           ├── extract-import/
│           │   └── route.ts
│           ├── cluster-hydrants/
│           │   └── route.ts
│           └── update-clusters/
│               └── route.ts
└── components/
    └── admin/
        ├── AdminTabs.tsx
        ├── AdminActions.tsx (existing functionality)
        ├── GisDataPipeline.tsx
        ├── HydrantClusters.tsx
        ├── ProgressStepper.tsx
        ├── DataPreview.tsx
        └── FileUpload.tsx
```

## Security

All operations require admin authorization (existing `isAdmin` check from session).
