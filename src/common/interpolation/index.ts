// Re-export public API
export type {
  Point2D,
  DataPoint,
  TpsWeights,
  AlgorithmParamDescriptor,
  InterpolationAlgorithm,
  PreparedInterpolation,
} from './types';
export {
  computeConvexHull,
  pointInPolygon,
  distanceToSegment,
  distanceToPolygonEdge,
  buildSpatialIndex,
  buildColorLUT,
} from './utils';
export { buildInterpolationGrid } from './grid';
export { registerAlgorithm, getAlgorithm, getAlgorithmList } from './registry';
export { idwAlgorithm, idwInterpolate } from './idw';
export { splineAlgorithm, solveTPS, evaluateTPS } from './spline';
export { krigingAlgorithm, fitVariogram, VARIOGRAM_SPHERICAL, VARIOGRAM_EXPONENTIAL, VARIOGRAM_GAUSSIAN } from './kriging';
export { steAlgorithm, windFromDegreesToRad } from './ste';
export { invSquareAlgorithm, valueAt1m } from './invSquare';
export type { InvSquareState } from './invSquare';
export { puffAlgorithm, gaussianPuff, estimatePuffSource } from './puff';
export type { GaussianPuffParams, PuffSourceEstimate } from './puff';

// Register built-in algorithms on import
import { registerAlgorithm } from './registry';
import { idwAlgorithm } from './idw';
import { splineAlgorithm } from './spline';
import { krigingAlgorithm } from './kriging';
import { steAlgorithm } from './ste';
import { invSquareAlgorithm } from './invSquare';
import { puffAlgorithm } from './puff';

registerAlgorithm(idwAlgorithm);
registerAlgorithm(splineAlgorithm);
registerAlgorithm(krigingAlgorithm);
registerAlgorithm(steAlgorithm);
registerAlgorithm(invSquareAlgorithm);
registerAlgorithm(puffAlgorithm);
