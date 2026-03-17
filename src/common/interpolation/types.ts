import type KDBush from 'kdbush';

export interface Point2D {
  x: number;
  y: number;
}

export interface DataPoint extends Point2D {
  value: number;
}

export interface TpsWeights {
  w: Float64Array;
  a: Float64Array;
  points: DataPoint[];
  shiftX: number;
  shiftY: number;
  scale: number;
  dataMin: number;
}

/**
 * Option entry for select-type parameters (rendered as dropdown).
 */
export interface ParamSelectOption {
  value: number;
  label: string;
}

/**
 * Descriptor for a single algorithm parameter.
 * Used to auto-generate UI controls in HeatmapSettings.
 */
export interface AlgorithmParamDescriptor {
  key: string;
  label: string;
  type: 'number' | 'boolean' | 'select';
  min?: number;
  max?: number;
  step?: number;
  /** Options for type 'select' — rendered as a dropdown */
  options?: ParamSelectOption[];
  default: number | boolean;
}

/**
 * The contract every interpolation algorithm must implement.
 *
 * TState is the type returned by prepare() and consumed by evaluate().
 * For algorithms with no precomputation, use a simple struct with points + params.
 */
export interface InterpolationAlgorithm<TState = unknown> {
  /** Unique identifier stored in HeatmapConfig.interpolationAlgorithm */
  id: string;
  /** Display name for the UI */
  label: string;
  /** Optional description shown as tooltip/help text */
  description?: string;
  /** Parameter schema — drives auto-generated UI controls */
  params: AlgorithmParamDescriptor[];

  /**
   * Minimum number of data points required for this algorithm to produce a
   * valid prepared state. Defaults to 1 if omitted.
   */
  minPoints?: number;

  /**
   * When true (or when this function returns true for the prepared state),
   * the grid builder renders the full canvas instead of clipping to the
   * convex hull + proximity of data points.
   * Pass a function to make this user-selectable via algorithm params.
   */
  fullCanvasRender?: boolean | ((state: TState) => boolean);

  /**
   * Precomputation phase. Called once when points or params change.
   * Build spatial indices, solve matrices, etc.
   */
  prepare(points: DataPoint[], params: Record<string, number | boolean>): TState;

  /**
   * Per-pixel evaluation. Called for every grid cell.
   * Must be fast — O(k) or better where k = nearby points.
   */
  evaluate(x: number, y: number, state: TState): number;

  /**
   * Optional: return the location and value of the peak concentration.
   * Coordinates use the same space as evaluate() (pixels or meters depending on caller).
   * When provided, the max-value marker on the map jumps to this location instead of
   * being estimated from a coarse grid search over the measurement bounding box.
   */
  peakPoint?(state: TState): { x: number; y: number; value: number } | null;

  /**
   * Optional: return synthetic values that define the color scale [min, max].
   * When provided, the interpolation grid is color-normalized against these values
   * instead of the raw measurement values. Useful for physics-based algorithms
   * (e.g. Gaussian Puff) where the rendered peak may differ from the measurements.
   */
  colorScaleValues?(state: TState): number[] | null;
}

/**
 * Prepared state passed to buildInterpolationGrid.
 * Wraps the algorithm instance and its precomputed state together.
 */
export interface PreparedInterpolation {
  algorithm: InterpolationAlgorithm<unknown>;
  state: unknown;
}
