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

// Register built-in algorithms on import
import { registerAlgorithm } from './registry';
import { idwAlgorithm } from './idw';
import { splineAlgorithm } from './spline';

registerAlgorithm(idwAlgorithm);
registerAlgorithm(splineAlgorithm);
