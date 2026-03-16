import KDBush from 'kdbush';
import type { DataPoint, InterpolationAlgorithm } from './types';

// ---------------------------------------------------------------------------
// Variogram model constants
// ---------------------------------------------------------------------------

export const VARIOGRAM_SPHERICAL = 0;
export const VARIOGRAM_EXPONENTIAL = 1;
export const VARIOGRAM_GAUSSIAN = 2;

// ---------------------------------------------------------------------------
// Variogram models: γ(h) given nugget (c0), sill (c0+c), range (a)
// ---------------------------------------------------------------------------

type VariogramFn = (h: number, nugget: number, sill: number, range: number) => number;

function spherical(h: number, nugget: number, sill: number, range: number): number {
  if (h < 1e-10) return 0;
  const c = sill - nugget;
  if (h >= range) return sill;
  const hr = h / range;
  return nugget + c * (1.5 * hr - 0.5 * hr * hr * hr);
}

function exponential(h: number, nugget: number, sill: number, range: number): number {
  if (h < 1e-10) return 0;
  const c = sill - nugget;
  return nugget + c * (1 - Math.exp((-3 * h) / range));
}

function gaussian(h: number, nugget: number, sill: number, range: number): number {
  if (h < 1e-10) return 0;
  const c = sill - nugget;
  return nugget + c * (1 - Math.exp((-3 * h * h) / (range * range)));
}

const VARIOGRAM_FNS: VariogramFn[] = [spherical, exponential, gaussian];

function getVariogramFn(model: number): VariogramFn {
  return VARIOGRAM_FNS[model] ?? spherical;
}

// ---------------------------------------------------------------------------
// Empirical variogram estimation & model fitting
// ---------------------------------------------------------------------------

export interface VariogramParams {
  nugget: number;
  sill: number;
  range: number;
}

/**
 * Estimate empirical variogram from data points and fit a model.
 *
 * @param points Data points in pixel coordinates
 * @param model Variogram model index (0=spherical, 1=exponential, 2=gaussian)
 * @param nuggetFraction User-specified nugget as fraction of total semivariance (0–1)
 */
export function fitVariogram(
  points: DataPoint[],
  model: number,
  nuggetFraction: number
): VariogramParams {
  const n = points.length;
  if (n < 2) {
    return { nugget: 0, sill: 1, range: 1 };
  }

  // Compute all pairwise distances and semivariances
  const pairs: { dist: number; semivar: number }[] = [];
  let maxDist = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const dv = points[i].value - points[j].value;
      const semivar = 0.5 * dv * dv;
      pairs.push({ dist, semivar });
      if (dist > maxDist) maxDist = dist;
    }
  }

  if (maxDist < 1e-10) {
    return { nugget: 0, sill: 1, range: 1 };
  }

  // Bin into ~15 lag classes up to maxDist / 2
  const numBins = Math.min(15, Math.max(3, Math.floor(pairs.length / 10)));
  const maxLag = maxDist / 2;
  const binWidth = maxLag / numBins;
  const binCount = new Float64Array(numBins);
  const binSum = new Float64Array(numBins);

  for (const p of pairs) {
    if (p.dist >= maxLag) continue;
    const bin = Math.min(Math.floor(p.dist / binWidth), numBins - 1);
    binCount[bin]++;
    binSum[bin] += p.semivar;
  }

  // Empirical semivariance per bin
  const lagH: number[] = [];
  const gamma: number[] = [];
  for (let i = 0; i < numBins; i++) {
    if (binCount[i] < 1) continue;
    lagH.push((i + 0.5) * binWidth);
    gamma.push(binSum[i] / binCount[i]);
  }

  if (lagH.length < 2) {
    const totalVar = gamma.length > 0 ? gamma[0] : 1;
    return { nugget: nuggetFraction * totalVar, sill: totalVar, range: maxLag };
  }

  // Estimate sill as the mean of the upper-half semivariances
  const sorted = [...gamma].sort((a, b) => a - b);
  const sill = sorted.slice(Math.floor(sorted.length / 2)).reduce((a, b) => a + b, 0) /
    Math.ceil(sorted.length / 2);
  const nugget = nuggetFraction * sill;

  // Fit range by weighted least-squares over a search grid
  const fn = getVariogramFn(model);
  let bestRange = maxLag * 0.5;
  let bestError = Infinity;
  const steps = 20;
  for (let s = 1; s <= steps; s++) {
    const candidateRange = (maxLag * s) / steps;
    let error = 0;
    for (let i = 0; i < lagH.length; i++) {
      const predicted = fn(lagH[i], nugget, sill, candidateRange);
      const diff = predicted - gamma[i];
      // Weight by number of pairs in bin (implicitly all equal here)
      error += diff * diff;
    }
    if (error < bestError) {
      bestError = error;
      bestRange = candidateRange;
    }
  }

  return {
    nugget: Math.max(0, nugget),
    sill: Math.max(nugget + 1e-10, sill),
    range: Math.max(1e-10, bestRange),
  };
}

// ---------------------------------------------------------------------------
// Ordinary Kriging state & implementation
// ---------------------------------------------------------------------------

interface KrigingState {
  points: DataPoint[];
  index: KDBush;
  variogramFn: VariogramFn;
  variogram: VariogramParams;
  maxNeighbors: number;
  searchRadius: number;
  mean: number;
}

/**
 * Covariance function derived from variogram: C(h) = sill - γ(h)
 */
function covariance(
  h: number,
  fn: VariogramFn,
  v: VariogramParams
): number {
  return v.sill - fn(h, v.nugget, v.sill, v.range);
}

/**
 * Solve a small (n+1)×(n+1) Ordinary Kriging system using Gaussian elimination.
 * The system includes a Lagrange multiplier row/column for the unbiasedness constraint.
 *
 * Returns kriging weights (length n), or null if the system is singular.
 */
function solveKrigingSystem(
  neighbors: DataPoint[],
  qx: number,
  qy: number,
  fn: VariogramFn,
  v: VariogramParams
): number[] | null {
  const k = neighbors.length;
  const size = k + 1; // +1 for Lagrange multiplier

  // Build the augmented matrix [C 1; 1' 0] and RHS [c0; 1]
  const A = new Float64Array(size * size);
  const b = new Float64Array(size);

  // Fill covariance matrix
  for (let i = 0; i < k; i++) {
    for (let j = i; j < k; j++) {
      if (i === j) {
        A[i * size + j] = v.sill; // C(0) = sill (includes nugget via variogram)
      } else {
        const dx = neighbors[i].x - neighbors[j].x;
        const dy = neighbors[i].y - neighbors[j].y;
        const h = Math.sqrt(dx * dx + dy * dy);
        const c = covariance(h, fn, v);
        A[i * size + j] = c;
        A[j * size + i] = c;
      }
    }
    // Lagrange constraint columns/rows
    A[i * size + k] = 1;
    A[k * size + i] = 1;
  }
  // A[k * size + k] = 0 (already zero)

  // RHS: covariance between query point and each neighbor
  for (let i = 0; i < k; i++) {
    const dx = qx - neighbors[i].x;
    const dy = qy - neighbors[i].y;
    const h = Math.sqrt(dx * dx + dy * dy);
    b[i] = covariance(h, fn, v);
  }
  b[k] = 1; // Lagrange constraint: sum of weights = 1

  // Gaussian elimination with partial pivoting
  for (let col = 0; col < size; col++) {
    let maxVal = Math.abs(A[col * size + col]);
    let maxRow = col;
    for (let row = col + 1; row < size; row++) {
      const val = Math.abs(A[row * size + col]);
      if (val > maxVal) {
        maxVal = val;
        maxRow = row;
      }
    }
    if (maxRow !== col) {
      for (let c = 0; c < size; c++) {
        const tmp = A[col * size + c];
        A[col * size + c] = A[maxRow * size + c];
        A[maxRow * size + c] = tmp;
      }
      const tmp = b[col];
      b[col] = b[maxRow];
      b[maxRow] = tmp;
    }
    const pivot = A[col * size + col];
    if (Math.abs(pivot) < 1e-14) return null; // singular
    for (let row = col + 1; row < size; row++) {
      const factor = A[row * size + col] / pivot;
      for (let c = col; c < size; c++) {
        A[row * size + c] -= factor * A[col * size + c];
      }
      b[row] -= factor * b[col];
    }
  }

  // Back-substitution
  const x = new Float64Array(size);
  for (let row = size - 1; row >= 0; row--) {
    let sum = b[row];
    for (let col = row + 1; col < size; col++) {
      sum -= A[row * size + col] * x[col];
    }
    const diag = A[row * size + row];
    x[row] = Math.abs(diag) < 1e-14 ? 0 : sum / diag;
  }

  // Return only the kriging weights (not the Lagrange multiplier)
  return Array.from(x.slice(0, k));
}

// ---------------------------------------------------------------------------
// Algorithm definition
// ---------------------------------------------------------------------------

export const krigingAlgorithm: InterpolationAlgorithm<KrigingState> = {
  id: 'kriging',
  label: 'Kriging',
  description:
    'Kriging (Ordinary): Geostatistische Interpolation mit automatischer Variogramm-Anpassung – optimale Gewichtung basierend auf räumlicher Korrelation.',
  params: [
    {
      key: 'variogramModel',
      label: 'Variogramm-Modell',
      type: 'number',
      min: 0,
      max: 2,
      step: 1,
      default: VARIOGRAM_SPHERICAL,
    },
    {
      key: 'nugget',
      label: 'Nugget (Messrauschen)',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0,
    },
    {
      key: 'maxNeighbors',
      label: 'Max. Nachbarn',
      type: 'number',
      min: 5,
      max: 50,
      step: 5,
      default: 25,
    },
  ],

  prepare(points: DataPoint[], params: Record<string, number | boolean>): KrigingState {
    const model = typeof params.variogramModel === 'number' ? params.variogramModel : VARIOGRAM_SPHERICAL;
    const nuggetFraction = typeof params.nugget === 'number' ? params.nugget : 0;
    const maxNeighbors = typeof params.maxNeighbors === 'number' ? params.maxNeighbors : 25;
    const searchRadius =
      typeof params._searchRadius === 'number' ? params._searchRadius : Infinity;

    // Compute mean for fallback
    let mean = 0;
    for (let i = 0; i < points.length; i++) mean += points[i].value;
    mean = points.length > 0 ? mean / points.length : 0;

    if (points.length < 2) {
      return {
        points,
        index: new KDBush(0),
        variogramFn: getVariogramFn(model),
        variogram: { nugget: 0, sill: 1, range: 1 },
        maxNeighbors,
        searchRadius,
        mean,
      };
    }

    // Build spatial index
    const index = new KDBush(points.length);
    for (let i = 0; i < points.length; i++) {
      index.add(points[i].x, points[i].y);
    }
    index.finish();

    // Fit variogram
    const variogram = fitVariogram(points, model, nuggetFraction);
    const variogramFn = getVariogramFn(model);

    return { points, index, variogramFn, variogram, maxNeighbors, searchRadius, mean };
  },

  evaluate(x: number, y: number, state: KrigingState): number {
    const { points, index, variogramFn, variogram, maxNeighbors, searchRadius, mean } = state;

    if (points.length === 0) return 0;
    if (points.length === 1) return points[0].value;

    // Find nearest neighbors
    let neighborIds: number[];
    if (searchRadius === Infinity || points.length <= maxNeighbors) {
      neighborIds = Array.from({ length: points.length }, (_, i) => i);
    } else {
      neighborIds = index.within(x, y, searchRadius);
    }

    // Sort by distance and cap at maxNeighbors
    neighborIds.sort((a, b) => {
      const dxa = x - points[a].x;
      const dya = y - points[a].y;
      const dxb = x - points[b].x;
      const dyb = y - points[b].y;
      return dxa * dxa + dya * dya - (dxb * dxb + dyb * dyb);
    });
    if (neighborIds.length > maxNeighbors) {
      neighborIds = neighborIds.slice(0, maxNeighbors);
    }

    // Check for exact match
    for (const id of neighborIds) {
      const dx = x - points[id].x;
      const dy = y - points[id].y;
      if (dx * dx + dy * dy < 1e-10) return points[id].value;
    }

    if (neighborIds.length < 2) {
      return neighborIds.length === 1 ? points[neighborIds[0]].value : mean;
    }

    const neighbors = neighborIds.map((id) => points[id]);
    const weights = solveKrigingSystem(neighbors, x, y, variogramFn, variogram);

    if (!weights) {
      // Fallback to simple average if system is singular
      let sum = 0;
      for (const nb of neighbors) sum += nb.value;
      return sum / neighbors.length;
    }

    let result = 0;
    for (let i = 0; i < weights.length; i++) {
      result += weights[i] * neighbors[i].value;
    }
    return result;
  },
};
