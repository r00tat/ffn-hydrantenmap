# Cluster Summary Implementation Plan

> **Status:** Implemented.

**Goal:** Add cluster tooltips (icon+count per type) with configurable position and grouping intensity, plus a sidebar firecall summary.

**Tech Stack:** Leaflet, react-leaflet, leaflet.markercluster, MUI, TypeScript, Firebase/Firestore

---

### Task 1: Replace badge approach with Leaflet tooltips

Replaced custom `iconCreateFunction` (badge row below cluster circle) with Leaflet tooltips.

- Hover mode: `clustermouseover` event builds HTML tooltip and opens it
- Permanent mode: `animationend` event iterates `_featureGroup` to bind permanent tooltips
- Tooltip HTML: one `<div>` per type with `<img>` + count + German label
- Deleted `MarkerClusterSummary.css` (badge row CSS no longer needed)

### Task 2: Add configurable summary position

Replaced `showSummary` boolean with `summaryPosition` select field on `FirecallItemLayer`.

Options: Aus, Bei Hover, Oben, Unten, Links, Rechts.

- Hydrant layer defaults to `hover`
- Firecall layers default to `right` (backward compat from old `showSummary`)

### Task 3: Add configurable cluster grouping

Added `clusterMode` select field to `FirecallItemLayer` with 3 presets:

- Wenig (30px), Normal (60px), Viel (120px)

Fixed `MarkerClusterGroup` constructor: `initialize(options)` takes only one argument. The old `new MarkerClusterGroup([], options)` passed `[]` as options and silently discarded the actual options.

### Task 4: Complete marker type labels

Added all icon types to `TYPE_MAP` and `TYPE_LABELS` with proper German labels:

- 3 hydrant subtypes (Hydranten, Unterflurhydranten, Füllhydranten)
- Fahrzeuge, Marker, Einsatzort, Rohre, Atemschutz-Sammelplatz
- Einsatzleitung, Kreise, Risikoobjekte, Gefahrobjekte, Löschteiche, Saugstellen

### Task 5: Sidebar firecall summary

Created `SidebarFirecallSummary.tsx` — MUI Accordion in map sidebar showing all firecall items grouped by type from Firestore.

### Task 6: Cleanup

- Deleted `ClusterLegend.tsx` (unused overlay legend)
- Deleted `MarkerClusterSummary.css` (badge row CSS)

---

## Key Commits

| Commit  | Description                                                    |
| ------- | -------------------------------------------------------------- |
| 7ddccca | feat: cluster tooltips, configurable position/grouping, labels |

## Key Technical Lessons

- `MarkerClusterGroup.initialize(options)` takes ONE argument. `new MarkerClusterGroup([], opts)` silently ignores `opts`.
- `.marker-cluster div` CSS applies to ALL child divs — use `<span>` if adding custom HTML inside cluster icons.
- `map.eachLayer()` cannot see markers inside `MarkerClusterGroup` — use `instance._featureGroup.eachLayer()` instead.
- React-Leaflet `LayerGroupProps` include `eventHandlers` which should NOT be spread into `MarkerClusterGroup` constructor.
