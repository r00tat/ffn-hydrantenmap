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

/**
 * Gaussian Plume concentration at a point in wind-aligned coordinates.
 * Simplified model without ground reflection — the estimated Q absorbs the
 * factor of 2 for ground-level releases (H=0). For elevated releases (H>0)
 * the model underpredicts by ~2x compared to the standard formulation.
 */
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
  /** Grid search step in meters */
  searchResolution: number;
  /** Real-world scale: meters per pixel (injected by InterpolationOverlay) */
  metersPerPixel: number;
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

interface SteState {
  sourceX: number;
  sourceY: number;
  releaseRate: number;
  windDirRad: number;
  windSpeed: number;
  stabilityClass: number;
  releaseHeight: number;
  /** Real-world scale: meters per pixel */
  metersPerPixel: number;
  /**
   * Fallback data points for IDW evaluation when source estimation fails
   * (Q=0 means no valid downwind source position was found).
   */
  fallbackPoints: DataPoint[];
}

/**
 * Simple IDW evaluation used as fallback when Gaussian Plume estimation fails.
 */
function idwFallback(x: number, y: number, points: DataPoint[]): number {
  let wSum = 0;
  let vSum = 0;
  for (const pt of points) {
    const dx = x - pt.x;
    const dy = y - pt.y;
    const distSq = Math.max(dx * dx + dy * dy, 1e-10);
    const w = 1 / distSq; // power=2
    wSum += w;
    vSum += w * pt.value;
  }
  return wSum > 0 ? vSum / wSum : 0;
}

/**
 * Convert wind direction from meteorological degrees (where wind comes FROM,
 * 0=N, 90=E, clockwise) to radians in compass-bearing convention used by
 * toWindCoords (0=north, PI/2=east).
 */
function windFromDegreesToRad(degrees: number): number {
  // Meteorological "from" + 180 = "towards" direction in compass degrees
  const towardsDeg = (degrees + 180) % 360;
  return (towardsDeg * Math.PI) / 180;
}

/**
 * Estimate the source location and release rate from measurement points.
 * Uses brute-force grid search with log-space least-squares Q estimation.
 * Requires at least 2 (ideally 3+) measurement points for meaningful results.
 */
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

  // Convert search resolution from meters to pixels
  const mpp = Math.max(params.metersPerPixel, 1e-6);
  const res = params.searchResolution / mpp;
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
        const [downwindPx, crosswindPx] = toWindCoords(
          p.x,
          p.y,
          cx,
          cy,
          windDirRad
        );
        // Scale pixel distances to meters for the Gaussian Plume model
        const downwind = downwindPx * mpp;
        const crosswind = crosswindPx * mpp;
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

export const steAlgorithm: InterpolationAlgorithm<SteState> = {
  id: 'ste',
  label: 'Source Term Estimation',
  description:
    'Quellstärkenabschätzung: Schätzt aus Messwerten den Ursprung und die Stärke einer Emissionsquelle mittels Gaußschem Ausbreitungsmodell (Gauß-Fahne).',
  params: [
    {
      key: 'windDirection',
      label: 'Windrichtung (°, woher)',
      type: 'number',
      min: 0,
      max: 360,
      step: 5,
      default: 270,
    },
    {
      key: 'windSpeed',
      label: 'Windgeschwindigkeit (m/s)',
      type: 'number',
      min: 0,
      max: 30,
      step: 0.5,
      default: 3,
    },
    {
      key: 'stabilityClass',
      label: 'Stabilitätsklasse',
      type: 'select',
      options: [
        { value: 1, label: 'A – sehr labil (sonnig, schwach windig)' },
        { value: 2, label: 'B – labil (sonnig, mäßig windig)' },
        { value: 3, label: 'C – leicht labil (bewölkt, windig)' },
        { value: 4, label: 'D – neutral (bedeckt oder windig)' },
        { value: 5, label: 'E – leicht stabil (Nacht, leichter Wind)' },
        { value: 6, label: 'F – stabil (klare Nacht, windstill)' },
      ],
      default: 4,
    },
    {
      key: 'releaseHeight',
      label: 'Quellhöhe (m)',
      type: 'number',
      min: 0,
      max: 100,
      step: 1,
      default: 0,
    },
    {
      key: 'searchResolution',
      label: 'Suchraster (m)',
      type: 'number',
      min: 5,
      max: 50,
      step: 5,
      default: 20,
    },
  ],

  prepare(points: DataPoint[], params: Record<string, number | boolean>): SteState {
    const windDir = typeof params.windDirection === 'number' ? params.windDirection : 270;
    const windSpeed = typeof params.windSpeed === 'number' ? params.windSpeed : 3;
    const stabilityClass =
      typeof params.stabilityClass === 'number' ? params.stabilityClass : 4;
    const releaseHeight =
      typeof params.releaseHeight === 'number' ? params.releaseHeight : 0;
    const searchResolution =
      typeof params.searchResolution === 'number' ? params.searchResolution : 20;
    // Injected by InterpolationOverlay — real-world scale for the Gaussian Plume model.
    // Falls back to 1.0 in unit tests where coordinates are already in meters.
    const metersPerPixel =
      typeof params._metersPerPixel === 'number' ? params._metersPerPixel : 1;

    const windDirRad = windFromDegreesToRad(windDir);

    const estimate = estimateSource(points, windDirRad, {
      windSpeed,
      stabilityClass,
      releaseHeight,
      searchResolution,
      metersPerPixel,
    });

    return {
      sourceX: estimate.sourceX,
      sourceY: estimate.sourceY,
      releaseRate: estimate.releaseRate,
      windDirRad,
      windSpeed,
      stabilityClass,
      releaseHeight,
      metersPerPixel,
      fallbackPoints: points,
    };
  },

  evaluate(x: number, y: number, state: SteState): number {
    // When source estimation failed (no valid downwind position found), fall
    // back to IDW so the hull shows meaningful interpolated values instead of
    // a uniform minimum.
    if (state.releaseRate < 1e-30) {
      return idwFallback(x, y, state.fallbackPoints);
    }

    const dx = x - state.sourceX;
    const dy = y - state.sourceY;
    // Use same compass-bearing convention as toWindCoords, then scale to meters
    const mpp = Math.max(state.metersPerPixel, 1e-6);
    const downwind =
      (dx * Math.sin(state.windDirRad) + dy * Math.cos(state.windDirRad)) * mpp;
    const crosswind =
      (dx * Math.cos(state.windDirRad) - dy * Math.sin(state.windDirRad)) * mpp;

    return gaussianPlume(downwind, crosswind, {
      Q: state.releaseRate,
      windSpeed: state.windSpeed,
      stabilityClass: state.stabilityClass,
      releaseHeight: state.releaseHeight,
    });
  },
};
