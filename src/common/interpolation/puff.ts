import type { DataPoint, InterpolationAlgorithm } from './types';
import { pasquillSigmaY, pasquillSigmaZ, windFromDegreesToRad } from './ste';

export interface GaussianPuffParams {
  Q: number;
  windSpeed: number;
  stabilityClass: number;
  releaseHeight: number;
  /** Deposition time constant in seconds. 0 = no deposition. */
  depositionTau?: number;
}

/**
 * Gaussian Puff concentration at a point in wind-aligned coordinates at time tElapsed.
 *
 * The puff center has traveled d = windSpeed * tElapsed meters downwind.
 * Dispersion coefficients are computed at distance d using Pasquill-Gifford.
 * Along-wind spread σx is approximated as equal to σy (standard simplification).
 *
 * @param downwind  - downwind coordinate relative to source (m)
 * @param crosswind - crosswind coordinate relative to source (m)
 * @param tElapsed  - seconds since release
 * @param params
 */
export function gaussianPuff(
  downwind: number,
  crosswind: number,
  tElapsed: number,
  params: GaussianPuffParams
): number {
  if (tElapsed <= 0) return 0;

  const { Q, windSpeed, stabilityClass, releaseHeight, depositionTau } = params;
  const u = Math.max(0.1, windSpeed);

  // Distance traveled by puff center
  const d = u * tElapsed;

  const sigmaY = pasquillSigmaY(d, stabilityClass);
  const sigmaZ = pasquillSigmaZ(d, stabilityClass);
  const sigmaX = sigmaY; // along-wind spread ≈ lateral spread

  // Downwind displacement from puff center
  const dx = downwind - d;

  const downwindTerm = Math.exp(-(dx * dx) / (2 * sigmaX * sigmaX));
  const crosswindTerm = Math.exp(-(crosswind * crosswind) / (2 * sigmaY * sigmaY));
  // Vertical: ground reflection (factor 2), evaluated at z=0
  const verticalTerm = 2 * Math.exp(-(releaseHeight * releaseHeight) / (2 * sigmaZ * sigmaZ));

  const concentration =
    (Q / (Math.pow(2 * Math.PI, 1.5) * sigmaX * sigmaY * sigmaZ)) *
    downwindTerm *
    crosswindTerm *
    verticalTerm;

  // Optional first-order deposition decay
  if (depositionTau && depositionTau > 0) {
    return concentration * Math.exp(-tElapsed / depositionTau);
  }
  return concentration;
}

export interface PuffSourceEstimate {
  sourceX: number;
  sourceY: number;
  releaseQuantity: number;
  error: number;
}

interface PuffSearchParams {
  windSpeed: number;
  stabilityClass: number;
  releaseHeight: number;
  /** Grid search step in meters */
  searchResolution: number;
  /** Real-world scale: meters per pixel */
  metersPerPixel: number;
  /** Elapsed time in seconds (timeSinceRelease + predictionOffset) */
  tElapsed: number;
}

/**
 * Transform (px, py) from map coords to wind-aligned coords relative to a candidate source.
 * Returns [downwind, crosswind] in meters.
 */
function toWindCoords(
  px: number,
  py: number,
  srcX: number,
  srcY: number,
  windDirRad: number,
  mpp: number
): [number, number] {
  const dx = (px - srcX) * mpp;
  const dy = (py - srcY) * mpp;
  const downwind = dx * Math.sin(windDirRad) + dy * Math.cos(windDirRad);
  const crosswind = dx * Math.cos(windDirRad) - dy * Math.sin(windDirRad);
  return [downwind, crosswind];
}

/**
 * Estimate source position and total released mass Q from measurement points.
 * Fits the Gaussian Puff model at tElapsed via grid-search + log-space least-squares.
 * Requires at least 2 positive measurement points for meaningful results.
 */
export function estimatePuffSource(
  points: DataPoint[],
  windDirRad: number,
  params: PuffSearchParams
): PuffSourceEstimate {
  if (points.length === 0) {
    return { sourceX: 0, sourceY: 0, releaseQuantity: 0, error: Infinity };
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  const extent = Math.max(maxX - minX, maxY - minY, 100);
  const buffer = extent * 1.5;
  const mpp = Math.max(params.metersPerPixel, 1e-6);
  const res = params.searchResolution / mpp;

  // Estimate source location: centroid of measurements shifted upwind by puff travel distance.
  // This ensures the grid always covers the upwind region where the source must be.
  const centX = (minX + maxX) / 2;
  const centY = (minY + maxY) / 2;
  const dPixels = (params.windSpeed * params.tElapsed) / mpp;
  const estSrcX = centX - Math.sin(windDirRad) * dPixels;
  const estSrcY = centY - Math.cos(windDirRad) * dPixels;

  const gMinX = Math.floor((Math.min(minX, estSrcX) - buffer) / res) * res;
  const gMaxX = Math.ceil((Math.max(maxX, estSrcX) + buffer) / res) * res;
  const gMinY = Math.floor((Math.min(minY, estSrcY) - buffer) / res) * res;
  const gMaxY = Math.ceil((Math.max(maxY, estSrcY) + buffer) / res) * res;

  const unitParams: GaussianPuffParams = {
    Q: 1,
    windSpeed: params.windSpeed,
    stabilityClass: params.stabilityClass,
    releaseHeight: params.releaseHeight,
  };

  let maxMeasurement = 0;
  for (const p of points) {
    if (p.value > maxMeasurement) maxMeasurement = p.value;
  }
  const dataFloor = Math.max(maxMeasurement * 0.001, 1e-9);

  // Puff-center-to-centroid distance is used as a tiebreaker: when multiple source
  // candidates produce equally small fitting errors (degenerate case where all measurements
  // lie on the same downwind line), prefer the candidate whose puff center falls closest
  // to the measurement centroid. This has a clear physical interpretation: the source
  // that places the peak concentration at the observed measurement cluster is preferred.
  const centXAvg = points.reduce((s, p) => s + p.x, 0) / points.length;
  const centYAvg = points.reduce((s, p) => s + p.y, 0) / points.length;

  let bestError = Infinity;
  let bestPuffCentDist = Infinity;
  let bestX = 0;
  let bestY = 0;
  let bestQ = 0;

  for (let cx = gMinX; cx <= gMaxX; cx += res) {
    for (let cy = gMinY; cy <= gMaxY; cy += res) {
      const unitConcs: number[] = [];
      let valid = true;

      for (const p of points) {
        const [downwind, crosswind] = toWindCoords(p.x, p.y, cx, cy, windDirRad, mpp);
        const c = gaussianPuff(downwind, crosswind, params.tElapsed, unitParams);
        unitConcs.push(c);
        if (c <= 0) { valid = false; break; }
      }

      if (!valid) continue;

      // Estimate Q from positive measurements via log-space least-squares
      let sumLogRatio = 0;
      let posCount = 0;
      for (let i = 0; i < points.length; i++) {
        if (points[i].value <= 0) continue;
        sumLogRatio += Math.log(points[i].value) - Math.log(unitConcs[i]);
        posCount++;
      }
      if (posCount === 0) continue;

      const Q = Math.exp(sumLogRatio / posCount);
      if (Q <= 0) continue;

      let error = 0;
      for (let i = 0; i < points.length; i++) {
        const logPred = Math.log(Q * unitConcs[i]);
        const logObs = Math.log(Math.max(points[i].value, dataFloor));
        const diff = logPred - logObs;
        error += diff * diff;
      }

      // Puff center position in pixel coords for this candidate source
      const pcX = cx + (params.windSpeed * params.tElapsed / mpp) * Math.sin(windDirRad);
      const pcY = cy + (params.windSpeed * params.tElapsed / mpp) * Math.cos(windDirRad);
      const puffCentDist = (pcX - centXAvg) ** 2 + (pcY - centYAvg) ** 2;

      const EPSILON = 1e-10;
      const isBetter = error < bestError - EPSILON;
      const isEquivalent = Math.abs(error - bestError) <= EPSILON;
      if (isBetter || (isEquivalent && puffCentDist < bestPuffCentDist)) {
        bestError = error;
        bestPuffCentDist = puffCentDist;
        bestX = cx;
        bestY = cy;
        bestQ = Q;
      }
    }
  }

  return {
    sourceX: bestX,
    sourceY: bestY,
    releaseQuantity: bestQ,
    error: bestError,
  };
}

interface PuffState {
  sourceX: number;
  sourceY: number;
  releaseQuantity: number;
  windDirRad: number;
  windSpeed: number;
  stabilityClass: number;
  releaseHeight: number;
  /** Total elapsed time in seconds (timeSinceRelease + predictionOffset) */
  tElapsed: number;
  /** Deposition time constant in seconds (0 = disabled) */
  depositionTau: number;
  metersPerPixel: number;
  fullCanvasRender: boolean;
}

export const puffAlgorithm: InterpolationAlgorithm<PuffState> = {
  id: 'puff',
  label: 'Ausbreitungsprognose',
  description:
    'Prognostiziert die Position und Konzentration einer Schadstoffwolke (Gauß-Puff-Modell) zu einem wählbaren Zeitpunkt. Schätzt Quellort und freigesetzte Masse aus Messwerten und berechnet die Ausbreitung unter Berücksichtigung von Wind, Stabilitätsklasse und atmosphärischer Ablagerung.',
  minPoints: 2,
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
      min: 1,
      max: 100,
      step: 1,
      default: 1,
    },
    {
      key: 'timeSinceRelease',
      label: 'Zeit seit Freisetzung (min)',
      type: 'number',
      min: 0,
      max: 240,
      step: 1,
      default: 30,
    },
    {
      key: 'predictionOffset',
      label: 'Prognose-Horizont (min)',
      type: 'number',
      min: 0,
      max: 120,
      step: 1,
      default: 0,
    },
    {
      key: 'depositionTimeConstant',
      label: 'Ablagerungszeitkonstante (min, 0=keine)',
      type: 'number',
      min: 0,
      max: 120,
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
    {
      key: 'fullCanvasRender',
      label: 'Gesamte Karte rendern (Wolkenform über Messbereich hinaus)',
      type: 'boolean',
      default: true,
    },
  ],

  prepare(points: DataPoint[], params: Record<string, number | boolean>): PuffState {
    const windDir = typeof params.windDirection === 'number' ? params.windDirection : 270;
    const windSpeed = typeof params.windSpeed === 'number' ? params.windSpeed : 3;
    const stabilityClass = typeof params.stabilityClass === 'number' ? params.stabilityClass : 4;
    const releaseHeight = typeof params.releaseHeight === 'number' ? params.releaseHeight : 1;
    const timeSinceRelease = typeof params.timeSinceRelease === 'number' ? params.timeSinceRelease : 30;
    const predictionOffset = typeof params.predictionOffset === 'number' ? params.predictionOffset : 0;
    const depositionTimeConstant = typeof params.depositionTimeConstant === 'number' ? params.depositionTimeConstant : 0;
    const searchResolution = typeof params.searchResolution === 'number' ? params.searchResolution : 20;
    const metersPerPixel = typeof params._metersPerPixel === 'number' ? params._metersPerPixel : 1;
    const fullCanvasRender = params.fullCanvasRender !== false; // default true

    const windDirRad = windFromDegreesToRad(windDir);
    // Convert minutes to seconds.
    // tMeasured: when measurements were taken (used to fit Q and source position).
    // tElapsed:  when to render the puff (timeSinceRelease + predictionOffset).
    // These must be kept separate so that Q is never overestimated due to the puff
    // having already traveled past the measurement points when predictionOffset > 0.
    const tMeasured = timeSinceRelease * 60;
    const tElapsed = (timeSinceRelease + predictionOffset) * 60;
    const depositionTau = depositionTimeConstant * 60;

    // Guard: cannot fit a puff that hasn't been released yet.
    if (tMeasured <= 0) {
      return {
        sourceX: 0, sourceY: 0, releaseQuantity: 0,
        windDirRad, windSpeed, stabilityClass, releaseHeight,
        tElapsed, depositionTau, metersPerPixel, fullCanvasRender,
      };
    }

    const estimate = estimatePuffSource(points, windDirRad, {
      windSpeed,
      stabilityClass,
      releaseHeight,
      searchResolution,
      metersPerPixel,
      tElapsed: tMeasured,
    });

    // Sanity check: if the predicted peak at the puff center is unreasonably large
    // compared to the highest measurement, the puff sigma is too small for the
    // measurement spacing at this time (e.g. t=1 min → sigma ~22 m but markers
    // hundreds of meters apart). Suppress rendering rather than show garbage values.
    let releaseQuantity = estimate.releaseQuantity;
    if (releaseQuantity > 0) {
      const maxMeasValue = points.reduce((m, p) => Math.max(m, p.value), 0);
      if (maxMeasValue > 0) {
        const peakConc = gaussianPuff(windSpeed * tMeasured, 0, tMeasured, {
          Q: releaseQuantity, windSpeed, stabilityClass, releaseHeight,
        });
        if (peakConc > maxMeasValue * 1e6) {
          releaseQuantity = 0;
        }
      }
    }

    return {
      sourceX: estimate.sourceX,
      sourceY: estimate.sourceY,
      releaseQuantity,
      windDirRad,
      windSpeed,
      stabilityClass,
      releaseHeight,
      tElapsed,
      depositionTau,
      metersPerPixel,
      fullCanvasRender,
    };
  },

  fullCanvasRender(state: PuffState): boolean {
    return state.fullCanvasRender;
  },

  evaluate(x: number, y: number, state: PuffState): number {
    if (state.releaseQuantity < 1e-9) return 0;

    const mpp = Math.max(state.metersPerPixel, 1e-6);
    const dx = (x - state.sourceX) * mpp;
    const dy = (y - state.sourceY) * mpp;
    const downwind = dx * Math.sin(state.windDirRad) + dy * Math.cos(state.windDirRad);
    const crosswind = dx * Math.cos(state.windDirRad) - dy * Math.sin(state.windDirRad);

    return gaussianPuff(downwind, crosswind, state.tElapsed, {
      Q: state.releaseQuantity,
      windSpeed: state.windSpeed,
      stabilityClass: state.stabilityClass,
      releaseHeight: state.releaseHeight,
      depositionTau: state.depositionTau > 0 ? state.depositionTau : undefined,
    });
  },
};
