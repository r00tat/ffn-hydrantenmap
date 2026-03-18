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
 *
 * For upwind points (downwind <= 0), applies along-wind Gaussian diffusion
 * (sigma_x) using total distance from source for dispersion coefficients.
 * This models pressure-driven and turbulent near-source dispersion.
 */
export function gaussianPlume(
  downwind: number,
  crosswind: number,
  params: GaussianPlumeParams
): number {
  const { Q, windSpeed, stabilityClass, releaseHeight } = params;
  const u = Math.max(0.1, windSpeed);

  if (downwind > 0) {
    // Classical Gaussian plume — unchanged
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

  // Upwind or at source (downwind <= 0): along-wind diffusion.
  // Use total distance from source for dispersion coefficients,
  // and apply Gaussian decay in the upwind direction.
  const dist = Math.sqrt(downwind * downwind + crosswind * crosswind);
  const dEff = Math.max(1, dist);

  const sigmaY = pasquillSigmaY(dEff, stabilityClass);
  const sigmaZ = pasquillSigmaZ(dEff, stabilityClass);
  const sigmaX = (3 * Math.sqrt(dEff)) / Math.sqrt(u); // along-wind diffusion: sqrt growth ensures decay at large distances

  const baseTerm = Q / (2 * Math.PI * u * sigmaY * sigmaZ);

  const crosswindTerm = Math.exp(
    -(crosswind * crosswind) / (2 * sigmaY * sigmaY)
  );
  const verticalTerm = Math.exp(
    -(releaseHeight * releaseHeight) / (2 * sigmaZ * sigmaZ)
  );
  // Gaussian decay in the upwind direction (downwind is negative or zero)
  const alongWindTerm = Math.exp(
    -(downwind * downwind) / (2 * sigmaX * sigmaX)
  );

  return baseTerm * crosswindTerm * verticalTerm * alongWindTerm;
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
  /** true when y-axis points south (Leaflet pixel coords) */
  yFlip?: boolean;
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
  windDirRad: number,
  yFlip: boolean
): [number, number] {
  const dx = px - srcX;
  // When y-axis points south (Leaflet pixels), negate to get standard math coords (+y = north)
  const dy = (yFlip ? -(py - srcY) : (py - srcY));
  const downwind = dx * Math.sin(windDirRad) + dy * Math.cos(windDirRad);
  const crosswind = dx * Math.cos(windDirRad) - dy * Math.sin(windDirRad);
  return [downwind, crosswind];
}

/** Correction factor at a measurement point: ratio of measured to model-predicted value. */
interface CorrectionPoint {
  x: number;
  y: number;
  ratio: number;
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
  /** Whether to render the full canvas (user-selectable via param) */
  fullCanvasRender: boolean;
  /** true when y-axis points south (Leaflet pixel coords) */
  yFlip: boolean;
  /** IDW correction factors at measurement locations to honor measured values */
  corrections: CorrectionPoint[];
}

/**
 * Convert wind direction from meteorological degrees (where wind comes FROM,
 * 0=N, 90=E, clockwise) to radians in compass-bearing convention used by
 * toWindCoords (0=north, PI/2=east).
 */
export function windFromDegreesToRad(degrees: number): number {
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

  const mpp = Math.max(params.metersPerPixel, 1e-6);

  // Convert to centroid-relative meter-space for stable grid search
  // (same approach as puff). Relative positions are viewport-independent.
  const centXPx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const centYPx = points.reduce((s, p) => s + p.y, 0) / points.length;
  const ySign = params.yFlip ? -1 : 1;
  const meterPoints: DataPoint[] = points.map(p => ({
    x: (p.x - centXPx) * mpp,
    y: ySign * (p.y - centYPx) * mpp,
    value: p.value,
  }));

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of meterPoints) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  const extent = Math.max(maxX - minX, maxY - minY, 100 * mpp);
  const buffer = extent * 1.5;
  const res = params.searchResolution; // already in meters

  const gMinX = Math.floor((minX - buffer) / res) * res;
  const gMaxX = Math.ceil((maxX + buffer) / res) * res;
  const gMinY = Math.floor((minY - buffer) / res) * res;
  const gMaxY = Math.ceil((maxY + buffer) / res) * res;

  const plumeParams: GaussianPlumeParams = {
    Q: 1,
    windSpeed: params.windSpeed,
    stabilityClass: params.stabilityClass,
    releaseHeight: params.releaseHeight,
  };

  let maxMeasurement = 0;
  for (const p of meterPoints) {
    if (p.value > maxMeasurement) maxMeasurement = p.value;
  }
  const dataFloor = Math.max(maxMeasurement * 0.001, 1e-9);

  let bestError = Infinity;
  let bestX = 0;
  let bestY = 0;
  let bestQ = 0;

  for (let cx = gMinX; cx <= gMaxX; cx += res) {
    for (let cy = gMinY; cy <= gMaxY; cy += res) {
      const unitConcs: number[] = [];
      for (const p of meterPoints) {
        // Already in meter-space with +y = north, no yFlip needed
        const downwind = (p.x - cx) * Math.sin(windDirRad) + (p.y - cy) * Math.cos(windDirRad);
        const crosswind = (p.x - cx) * Math.cos(windDirRad) - (p.y - cy) * Math.sin(windDirRad);
        const c = gaussianPlume(downwind, crosswind, plumeParams);
        unitConcs.push(c);
      }

      let sumLogRatio = 0;
      let posCount = 0;
      for (let i = 0; i < meterPoints.length; i++) {
        if (meterPoints[i].value <= 0 || unitConcs[i] <= 0) continue;
        sumLogRatio += Math.log(meterPoints[i].value) - Math.log(unitConcs[i]);
        posCount++;
      }
      if (posCount === 0) continue;
      const Q = Math.exp(sumLogRatio / posCount);
      if (Q <= 0) continue;

      let error = 0;
      for (let i = 0; i < meterPoints.length; i++) {
        const logPred = Math.log(Q * unitConcs[i]);
        const logObs = Math.log(Math.max(meterPoints[i].value, dataFloor));
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

  // Convert from meter-space back to input coordinate space
  return {
    sourceX: centXPx + bestX / mpp,
    sourceY: centYPx + ySign * bestY / mpp,
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
      default: 0,
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
      min: 1,
      max: 100,
      step: 1,
      default: 1,
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
    {
      key: 'fullCanvasRender',
      label: 'Gesamte Karte rendern (Fahnenform über Messbereich hinaus)',
      type: 'boolean',
      default: true,
    },
  ],

  prepare(points: DataPoint[], params: Record<string, number | boolean>): SteState {
    const windDir = typeof params.windDirection === 'number' ? params.windDirection : 0;
    const windSpeed = typeof params.windSpeed === 'number' ? params.windSpeed : 3;
    const stabilityClass =
      typeof params.stabilityClass === 'number' ? params.stabilityClass : 4;
    const releaseHeight =
      typeof params.releaseHeight === 'number' ? params.releaseHeight : 1;
    const searchResolution =
      typeof params.searchResolution === 'number' ? params.searchResolution : 20;
    // Injected by InterpolationOverlay — real-world scale for the Gaussian Plume model.
    // Falls back to 1.0 in unit tests where coordinates are already in meters.
    const metersPerPixel =
      typeof params._metersPerPixel === 'number' ? params._metersPerPixel : 1;
    const fullCanvasRender = !!params.fullCanvasRender;
    const yFlip = params._yAxisSouth === true;

    const windDirRad = windFromDegreesToRad(windDir);

    const estimate = estimateSource(points, windDirRad, {
      windSpeed,
      stabilityClass,
      releaseHeight,
      searchResolution,
      metersPerPixel,
      yFlip,
    });

    // Compute multiplicative correction factors at each measurement point.
    // The Gaussian plume model can't perfectly fit all measurements, so we
    // store the ratio (measured / predicted) at each point and IDW-interpolate
    // it during evaluate(). This ensures the rendered values honor measurements
    // at marker locations while preserving the plume shape elsewhere.
    const corrections: CorrectionPoint[] = [];
    if (estimate.releaseRate >= 1.0) {
      const mpp = Math.max(metersPerPixel, 1e-6);
      const plumeParams: GaussianPlumeParams = {
        Q: estimate.releaseRate,
        windSpeed,
        stabilityClass,
        releaseHeight,
      };
      for (const p of points) {
        const [dwPx, cwPx] = toWindCoords(
          p.x, p.y, estimate.sourceX, estimate.sourceY, windDirRad, yFlip
        );
        const predicted = gaussianPlume(dwPx * mpp, cwPx * mpp, plumeParams);
        if (predicted > 0 && p.value > 0) {
          corrections.push({ x: p.x, y: p.y, ratio: p.value / predicted });
        }
      }
    }

    return {
      sourceX: estimate.sourceX,
      sourceY: estimate.sourceY,
      releaseRate: estimate.releaseRate,
      windDirRad,
      windSpeed,
      stabilityClass,
      releaseHeight,
      metersPerPixel,
      fullCanvasRender,
      yFlip,
      corrections,
    };
  },

  fullCanvasRender(state: SteState): boolean {
    return state.fullCanvasRender;
  },

  peakPoint(state: SteState) {
    if (state.releaseRate < 1.0) return null;
    const mpp = Math.max(state.metersPerPixel, 1e-6);
    const ySign = state.yFlip ? -1 : 1;
    const plumeParams: GaussianPlumeParams = {
      Q: state.releaseRate,
      windSpeed: state.windSpeed,
      stabilityClass: state.stabilityClass,
      releaseHeight: state.releaseHeight,
    };
    // Sample downwind distances to find the centerline peak.
    // For elevated releases, the peak is at some distance where σz ≈ H/√2.
    let bestConc = 0;
    let bestDist = 0;
    for (let d = 1; d <= 5000; d += Math.max(1, d * 0.05)) {
      const c = gaussianPlume(d, 0, plumeParams);
      if (c > bestConc) { bestConc = c; bestDist = d; }
    }
    if (bestConc <= 0) return null;
    // Convert downwind distance to pixel offset from source
    const dPx = bestDist / mpp;
    const x = state.sourceX + Math.sin(state.windDirRad) * dPx;
    const y = state.sourceY + ySign * Math.cos(state.windDirRad) * dPx;
    return { x, y, value: bestConc };
  },

  colorScaleValues(state: SteState) {
    if (state.releaseRate < 1.0) return null;
    const plumeParams: GaussianPlumeParams = {
      Q: state.releaseRate,
      windSpeed: state.windSpeed,
      stabilityClass: state.stabilityClass,
      releaseHeight: state.releaseHeight,
    };
    // Find raw peak on centerline
    let rawPeak = 0;
    for (let d = 1; d <= 5000; d += Math.max(1, d * 0.05)) {
      const c = gaussianPlume(d, 0, plumeParams);
      if (c > rawPeak) rawPeak = c;
    }
    // The correction factors can push values above the raw peak,
    // so use the max correction-adjusted value if it's higher.
    let correctedPeak = rawPeak;
    for (const c of state.corrections) {
      const adjusted = rawPeak * c.ratio;
      if (adjusted > correctedPeak) correctedPeak = adjusted;
    }
    if (correctedPeak <= 0) return null;
    return [0, correctedPeak];
  },

  evaluate(x: number, y: number, state: SteState): number {
    if (state.releaseRate < 1.0) return 0;

    const mpp = Math.max(state.metersPerPixel, 1e-6);
    const [dwPx, cwPx] = toWindCoords(x, y, state.sourceX, state.sourceY, state.windDirRad, state.yFlip);
    const raw = gaussianPlume(dwPx * mpp, cwPx * mpp, {
      Q: state.releaseRate,
      windSpeed: state.windSpeed,
      stabilityClass: state.stabilityClass,
      releaseHeight: state.releaseHeight,
    });

    if (raw <= 0 || state.corrections.length === 0) return raw;

    // IDW-interpolate correction factors from measurement points.
    // At measurement locations the corrected value equals the measurement;
    // away from measurements the plume shape is preserved.
    let wSum = 0;
    let wrSum = 0;
    for (const c of state.corrections) {
      const d2 = (x - c.x) ** 2 + (y - c.y) ** 2;
      if (d2 < 1e-10) return raw * c.ratio;
      const w = 1 / (d2 * d2); // power=4 for sharp local correction
      wSum += w;
      wrSum += w * c.ratio;
    }

    return raw * (wrSum / wSum);
  },
};
