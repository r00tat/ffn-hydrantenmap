import type { DataPoint, InterpolationAlgorithm } from './types';

// Pasquill-Gifford sigma_y coefficients [a, b] for classes A(1) through F(6)
// sigma_y = a * x^b (x in meters)
const SY_COEFFS: [number, number][] = [
  [0.3658, 0.9031], // A
  [0.2751, 0.9031], // B
  [0.2090, 0.9031], // C
  [0.1471, 0.9031], // D
  [0.1046, 0.9031], // E
  [0.0722, 0.9031], // F
];

// Pasquill-Gifford sigma_z coefficients [a, b] for classes A(1) through F(6)
// sigma_z = a * x^b (x in meters)
const SZ_COEFFS: [number, number][] = [
  [0.192, 1.2822], // A
  [0.156, 1.0542], // B
  [0.116, 0.9145], // C
  [0.079, 0.7954], // D
  [0.063, 0.7046], // E
  [0.053, 0.6325], // F
];

const MIN_SIGMA = 0.1;

/**
 * Compute the lateral (crosswind) dispersion coefficient sigma_y
 * using Pasquill-Gifford parameterization.
 *
 * @param x - downwind distance in meters
 * @param stabilityClass - Pasquill stability class (1=A very unstable .. 6=F very stable)
 * @returns sigma_y in meters
 */
export function pasquillSigmaY(x: number, stabilityClass: number): number {
  const idx = Math.max(0, Math.min(5, Math.round(stabilityClass) - 1));
  const [a, b] = SY_COEFFS[idx];
  const dist = Math.max(1, x);
  return Math.max(MIN_SIGMA, a * Math.pow(dist, b));
}

/**
 * Compute the vertical dispersion coefficient sigma_z
 * using Pasquill-Gifford parameterization.
 *
 * @param x - downwind distance in meters
 * @param stabilityClass - Pasquill stability class (1=A very unstable .. 6=F very stable)
 * @returns sigma_z in meters
 */
export function pasquillSigmaZ(x: number, stabilityClass: number): number {
  const idx = Math.max(0, Math.min(5, Math.round(stabilityClass) - 1));
  const [a, b] = SZ_COEFFS[idx];
  const dist = Math.max(1, x);
  return Math.max(MIN_SIGMA, a * Math.pow(dist, b));
}

export interface GaussianPlumeParams {
  Q: number;
  windSpeed: number;
  stabilityClass: number;
  releaseHeight: number;
}

export function gaussianPlume(
  downwind: number,
  crosswind: number,
  params: GaussianPlumeParams
): number {
  if (downwind <= 0) return 0;

  const { Q, windSpeed, stabilityClass, releaseHeight } = params;
  const u = Math.max(0.1, windSpeed);

  const sigmaY = pasquillSigmaY(downwind, stabilityClass);
  const sigmaZ = pasquillSigmaZ(downwind, stabilityClass);

  const crosswindTerm = Math.exp(
    -(crosswind * crosswind) / (2 * sigmaY * sigmaY)
  );
  const verticalTerm = Math.exp(
    -(releaseHeight * releaseHeight) / (2 * sigmaZ * sigmaZ)
  );

  return (Q / (2 * Math.PI * u * sigmaY * sigmaZ)) * crosswindTerm * verticalTerm;
}

export interface SourceEstimate {
  sourceX: number;
  sourceY: number;
  releaseRate: number;
  error: number;
}

interface SearchParams {
  windSpeed: number;
  stabilityClass: number;
  releaseHeight: number;
  searchResolution: number;
}

/**
 * Transform (px, py) from global coords to wind-aligned coords relative to a candidate source.
 * Returns [downwind, crosswind].
 */
function toWindCoords(
  px: number,
  py: number,
  srcX: number,
  srcY: number,
  windDirRad: number
): [number, number] {
  const dx = px - srcX;
  const dy = py - srcY;
  const downwind = dx * Math.sin(windDirRad) + dy * Math.cos(windDirRad);
  const crosswind = dx * Math.cos(windDirRad) - dy * Math.sin(windDirRad);
  return [downwind, crosswind];
}

export function estimateSource(
  points: DataPoint[],
  windDirRad: number,
  params: SearchParams
): SourceEstimate {
  if (points.length === 0) {
    return { sourceX: 0, sourceY: 0, releaseRate: 0, error: Infinity };
  }

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  const extent = Math.max(maxX - minX, maxY - minY, 100);
  const buffer = extent * 1.5;
  minX -= buffer;
  maxX += buffer;
  minY -= buffer;
  maxY += buffer;

  const res = params.searchResolution;
  // Align grid to multiples of res so that origin (0,0) is always a grid point
  minX = Math.floor(minX / res) * res;
  maxX = Math.ceil(maxX / res) * res;
  minY = Math.floor(minY / res) * res;
  maxY = Math.ceil(maxY / res) * res;

  const plumeParams: GaussianPlumeParams = {
    Q: 1,
    windSpeed: params.windSpeed,
    stabilityClass: params.stabilityClass,
    releaseHeight: params.releaseHeight,
  };

  let bestError = Infinity;
  let bestX = 0;
  let bestY = 0;
  let bestQ = 0;

  for (let cx = minX; cx <= maxX; cx += res) {
    for (let cy = minY; cy <= maxY; cy += res) {
      let valid = true;
      const unitConcs: number[] = [];
      for (const p of points) {
        const [downwind, crosswind] = toWindCoords(
          p.x,
          p.y,
          cx,
          cy,
          windDirRad
        );
        const c = gaussianPlume(downwind, crosswind, plumeParams);
        unitConcs.push(c);
        if (c <= 0) {
          valid = false;
          break;
        }
      }

      if (!valid) continue;

      let sumLogRatio = 0;
      for (let i = 0; i < points.length; i++) {
        sumLogRatio +=
          Math.log(Math.max(points[i].value, 1e-30)) - Math.log(unitConcs[i]);
      }
      const logQ = sumLogRatio / points.length;
      const Q = Math.exp(logQ);

      if (Q <= 0) continue;

      let error = 0;
      for (let i = 0; i < points.length; i++) {
        const logPred = Math.log(Q * unitConcs[i]);
        const logObs = Math.log(Math.max(points[i].value, 1e-30));
        const diff = logPred - logObs;
        error += diff * diff;
      }

      if (error < bestError) {
        bestError = error;
        bestX = cx;
        bestY = cy;
        bestQ = Q;
      }
    }
  }

  return {
    sourceX: bestX,
    sourceY: bestY,
    releaseRate: bestQ,
    error: bestError,
  };
}
