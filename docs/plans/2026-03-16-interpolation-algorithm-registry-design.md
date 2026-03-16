# Extensible Interpolation Algorithm Registry

**Date:** 2026-03-16
**Status:** Approved

## Problem

The interpolation system currently has IDW and Thin-Plate Spline implemented as interleaved logic in a monolithic `interpolation.ts` (762 lines). Algorithm-specific branching is scattered across the grid builder, settings UI, and overlay component. Adding a new algorithm requires changes in 4+ files and understanding the implicit contracts between them.

## Goals

- Standardized interface so any algorithm can be added in a single file
- Auto-generated UI for algorithm-specific parameters from a declarative schema
- Per-layer algorithm configuration persisted in Firestore
- Clean two-phase lifecycle: expensive `prepare()` + cheap per-pixel `evaluate()`

## Design

### Core Interface (`src/common/interpolation/registry.ts`)

```typescript
export interface AlgorithmParamDescriptor {
  key: string;
  label: string;
  type: 'number' | 'boolean';
  min?: number;
  max?: number;
  step?: number;
  default: number | boolean;
}

export interface InterpolationAlgorithm<TState = unknown> {
  /** Unique identifier, used in HeatmapConfig.interpolationAlgorithm */
  id: string;
  /** Display name for the UI */
  label: string;
  /** Optional tooltip description */
  description?: string;
  /** Parameter schema — drives auto-generated UI controls */
  params: AlgorithmParamDescriptor[];

  /**
   * Optional expensive precomputation (matrix solve, spatial index, etc.).
   * Called once when points or params change.
   */
  prepare(points: DataPoint[], params: Record<string, number | boolean>): TState;

  /**
   * Per-pixel evaluation. Receives precomputed state from prepare().
   * Returns the interpolated value at (x, y) in pixel coordinates.
   */
  evaluate(x: number, y: number, state: TState): number;
}
```

### Algorithm Registry

A `Map<string, InterpolationAlgorithm>` with:
- `registerAlgorithm(algo)` — called at module level by each algorithm file
- `getAlgorithm(id)` — lookup by ID, returns undefined if not found
- `getAlgorithmList()` — returns all registered algorithms (for UI dropdowns)

### HeatmapConfig Changes

```typescript
export interface HeatmapConfig {
  // Existing shared fields (unchanged)
  enabled: boolean;
  activeKey: string;
  colorMode: 'auto' | 'manual';
  invertAutoColor?: boolean;
  radius?: number;
  blur?: number;
  min?: number;
  max?: number;
  colorStops?: { value: number; color: string }[];

  // Interpolation shared settings (unchanged)
  visualizationMode?: 'heatmap' | 'interpolation';
  interpolationRadius?: number;       // boundary buffer in meters
  interpolationOpacity?: number;      // surface opacity 0-1
  interpolationLogScale?: boolean;    // log-space interpolation

  // Algorithm selection (changed: open string instead of union)
  interpolationAlgorithm?: string;

  // Algorithm-specific parameters (NEW)
  interpolationParams?: Record<string, number | boolean>;

  // DEPRECATED — kept for backward compat migration
  interpolationPower?: number;
}
```

**Migration:** If `interpolationParams` is undefined but `interpolationPower` exists, the IDW algorithm reads it as a fallback. Once re-saved, the new format is used.

### File Structure

```
src/common/
  interpolation/
    index.ts              # re-exports, registers all built-in algorithms
    registry.ts           # interface, registry map, register/get functions
    types.ts              # DataPoint, Point2D, TpsWeights
    utils.ts              # convex hull, point-in-polygon, spatial index, color LUT
    grid.ts               # buildInterpolationGrid (algorithm-agnostic)
    idw.ts                # IDW implementation
    spline.ts             # TPS implementation
  interpolation.ts        # re-exports from interpolation/ for backward compat
  heatmap.ts              # unchanged
```

### Algorithm Implementations

**IDW (`idw.ts`):**
- `id: 'idw'`, `label: 'IDW'`
- `params: [{ key: 'power', label: 'Exponent', type: 'number', min: 1, max: 5, step: 0.5, default: 2 }]`
- `prepare()`: builds KDBush spatial index, stores points + power
- `evaluate()`: weighted average using spatial index for neighbor lookup

**TPS (`spline.ts`):**
- `id: 'spline'`, `label: 'Thin-Plate Spline'`
- `params: []` (lambda is auto-scaled internally, no user-facing params)
- `prepare()`: solves TPS matrix system, returns `TpsWeights`
- `evaluate()`: evaluates polynomial + radial basis at (x, y)

### UI Changes (`HeatmapSettings.tsx`)

The algorithm selector becomes a `ToggleButtonGroup` (or `Select`) populated from `getAlgorithmList()`. Below it, for each entry in the selected algorithm's `params` array:
- `type: 'number'` → `Slider` with `min`, `max`, `step`, and label
- `type: 'boolean'` → `Switch` with label

Values read from `heatmapConfig.interpolationParams[key]`, defaulting to `param.default`.

Shared controls (radius, opacity, log scale) remain as they are.

### Grid Builder Changes

`buildInterpolationGrid` receives:
- `algorithm: InterpolationAlgorithm` instance
- `state: unknown` (prepared state)

Instead of the current branching on `algorithm === 'spline'`, it calls `algorithm.evaluate(cx, cy, state)` uniformly.

### InterpolationOverlay Changes

1. Looks up algorithm from registry: `getAlgorithm(config.interpolationAlgorithm)`
2. Merges `config.interpolationParams` with algorithm defaults
3. Calls `algo.prepare(points, mergedParams)` when points/params change (memoized)
4. Passes algorithm + state to `buildInterpolationGrid`

## Adding a New Algorithm

To add e.g. Natural Neighbor interpolation:

1. Create `src/common/interpolation/natural-neighbor.ts`
2. Implement `InterpolationAlgorithm` with id, label, params, prepare, evaluate
3. Import and register in `src/common/interpolation/index.ts`
4. Done — UI picks it up automatically

## Out of Scope

- Algorithm performance hints in UI (e.g. "slow for >300 points")
- Async/web-worker execution of prepare()
- Algorithm-specific boundary/extrapolation behavior (all use shared convex hull logic)
