/**
 * @deprecated Import from './interpolation/index' instead.
 * This file re-exports everything for backward compatibility.
 */
export {
  type Point2D,
  type DataPoint,
  type TpsWeights,
  type AlgorithmParamDescriptor,
  type InterpolationAlgorithm,
  computeConvexHull,
  pointInPolygon,
  distanceToSegment,
  distanceToPolygonEdge,
  buildSpatialIndex,
  buildColorLUT,
  buildInterpolationGrid,
  registerAlgorithm,
  getAlgorithm,
  getAlgorithmList,
  idwAlgorithm,
  idwInterpolate,
  splineAlgorithm,
  solveTPS,
  evaluateTPS,
} from './interpolation/index';
