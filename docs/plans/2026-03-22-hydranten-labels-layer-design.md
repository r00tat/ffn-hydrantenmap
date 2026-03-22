# Hydranten Labels Layer Design

## Summary

Add a new toggleable map overlay "Hydranten Infos" that permanently displays hydrant information labels on the map. Uses existing cluster data, renders as permanent Leaflet Tooltips. Default off.

## Approach

Separate `HydrantenLabelsLayer` component (Ansatz A) — clean separation from existing `HydrantenLayer`, no changes to hydrant marker code.

## Components

### New: `src/components/Map/layers/HydrantenLabelsLayer.tsx`

- Uses `useClusters()` hook (same data source as `HydrantenLayer`)
- Renders invisible `CircleMarker` (radius 0) per hydrant with permanent `<Tooltip>`
- Label content (compact, multi-line):
  - Name
  - Leistung + Dimension (e.g. "1500 l/min (80mm)")
  - Dynamischer Druck (e.g. "3.5 bar dyn.")
  - Leitungsart (if present)
- Tooltip styling: `permanent`, `direction="bottom"`, `offset={[0, 10]}`, `opacity={0.8}`, `className="nopadding"`

### Modified: `src/components/Map/Map.tsx`

- New `<LayersControl.Overlay>` entry "Hydranten Infos"
- Positioned directly after the existing "Hydranten" overlay
- `checked={false}` (default off)

## Label Format

```
Hauptplatz 3
1500 l/min (80mm)
3.5 bar dyn.
Transportleitung
```

Lines with missing/zero values are omitted.
