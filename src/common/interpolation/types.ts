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
 * Descriptor for a single algorithm parameter.
 * Used to auto-generate UI controls in HeatmapSettings.
 */
export interface AlgorithmParamDescriptor {
  key: string;
  label: string;
  type: 'number' | 'boolean';
  min?: number;
  max?: number;
  step?: number;
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
   * Precomputation phase. Called once when points or params change.
   * Build spatial indices, solve matrices, etc.
   */
  prepare(points: DataPoint[], params: Record<string, number | boolean>): TState;

  /**
   * Per-pixel evaluation. Called for every grid cell.
   * Must be fast — O(k) or better where k = nearby points.
   */
  evaluate(x: number, y: number, state: TState): number;
}

/**
 * Prepared state passed to buildInterpolationGrid.
 * Wraps the algorithm instance and its precomputed state together.
 */
export interface PreparedInterpolation {
  algorithm: InterpolationAlgorithm<unknown>;
  state: unknown;
}
