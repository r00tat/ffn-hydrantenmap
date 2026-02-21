# Cluster Summary Design

> **Status:** Implemented.

## Goal

Add visual summaries to marker clusters so users can see at a glance what item types and counts are inside each cluster, without expanding it. Additionally, provide a sidebar summary of all firecall items grouped by type.

## Feature A: Cluster Tooltips

Leaflet tooltips on cluster markers showing icon + count per marker type. Configurable position per layer.

### Summary Position (per layer)

| Value | Behavior |
|-------|----------|
| `""` (Aus) | No tooltip |
| `hover` (Bei Hover) | Tooltip appears on cluster mouseover |
| `top`/`bottom`/`left`/`right` | Permanent tooltip at specified direction |

- **Hydrant layer** defaults to `hover`
- **Firecall layers** default to `right` (backward compat: derived from old `showSummary` field)

### Cluster Grouping (per layer)

Controls how aggressively markers are clustered via `maxClusterRadius`:

| Value | Label | Radius |
|-------|-------|--------|
| `""` | Normal | 60px |
| `wenig` | Wenig | 30px |
| `viel` | Viel | 120px |

### Implementation

- `MarkerClusterLayer` accepts `summaryPosition` and `clusterMode` props
- **Hover mode**: Binds `clustermouseover` event, builds HTML tooltip with `buildTooltipContent()`, opens tooltip on hover
- **Permanent mode**: Binds `animationend` event, iterates `instance._featureGroup` to find visible cluster markers and binds permanent tooltips
- `MarkerClusterGroup` constructor receives only clustering options (not React-Leaflet props) — `initialize(options)` takes a single argument
- Tooltip HTML: one `<div>` per type with `<img>` (16px icon) + count + German label

### Marker Type Identification

Pattern-based matching via `TYPE_MAP` array. Each entry maps an icon URL (string or regex) to a `typeKey`. Human-readable German labels in `TYPE_LABELS`.

Covered types:
- Hydranten (3 subtypes: Überflur, Unterflur, Füll)
- Fahrzeuge (`/api/fzg?*` dynamic URLs)
- Marker (`/api/icons/marker?*` dynamic URLs + `/icons/marker.svg`)
- Einsatzort, Rohre, Atemschutz-Sammelplatz, Einsatzleitung, Kreise
- Risikoobjekte, Gefahrobjekte, Löschteiche, Saugstellen

Fallback: URL cleanup (strip path, extensions, hyphens → title case).

## Feature B: Sidebar Firecall Summary

Sidebar Accordion section ("Zusammenfassung") showing all firecall items grouped by type, fetched from Firestore.

### Implementation

- `SidebarFirecallSummary.tsx` — MUI Accordion matching existing sidebar sections
- Fetches all firecall items via `useFirebaseCollection`
- Groups by `record.type`, uses `fcItemNames` for labels and `getItemClass` for icons
- Badge on accordion header shows total item count
- Returns `null` when no firecall selected or no items exist

## Files

| File | Status |
|------|--------|
| `src/components/Map/layers/MarkerClusterLayer.tsx` | Modified — tooltip logic, type mapping, cluster presets |
| `src/components/firebase/firestore.ts` | Modified — `summaryPosition`, `clusterMode` on `FirecallLayer` |
| `src/components/FirecallItems/elements/FirecallItemLayer.tsx` | Modified — select fields for summaryPosition and clusterMode |
| `src/components/Map/layers/FirecallLayer.tsx` | Modified — passes summaryPosition and clusterMode |
| `src/components/Map/layers/HydrantenLayer.tsx` | Modified — accepts `summaryPosition` (default `'hover'`) |
| `src/components/Map/Clusters.tsx` | Modified — passes `summaryPosition="hover"` |
| `src/components/Map/SidebarFirecallSummary.tsx` | Created — sidebar summary |
| `src/components/Map/MapSidebar.tsx` | Modified — includes SidebarFirecallSummary |
| `src/components/Map/layers/ClusterLegend.tsx` | Deleted — unused overlay legend |
| `src/components/Map/layers/MarkerClusterSummary.css` | Deleted — badge row CSS no longer needed |
