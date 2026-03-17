import type { DataPoint, InterpolationAlgorithm } from './types';

// ---------------------------------------------------------------------------
// Inverse-Square + Directional Shielding (ISDS) interpolation
//
// Algorithm overview:
//  1. Locate source: grid-search minimising CV of v·d² → (sourceX, sourceY)
//  2. Fit source strength k: robust median of vᵢ·dᵢ²
//  3. Per-measurement shielding factor: sᵢ = vᵢ / (k / dᵢ²)
//     sᵢ = 1 → unshielded, sᵢ < 1 → attenuated by obstacle(s)
//  4. Evaluate at (x,y): use angular IDW over the shielding factors to
//     estimate directional attenuation, then apply k/d² · s(θ)
//
// valueAt1m(state) returns k — the unshielded source strength at 1 m.
// ---------------------------------------------------------------------------

export interface InvSquareState {
  sourceX: number;
  sourceY: number;
  /** Source strength: unshielded value at 1 m distance */
  k: number;
  metersPerPixel: number;
  /** Angle from source to each measurement point (radians) */
  angles: Float64Array;
  /** Shielding factor per measurement (1 = none, <1 = attenuated) */
  shielding: Float64Array;
  fullCanvasRender: boolean;
}

// ---------------------------------------------------------------------------
// Source location: optimised to minimise coefficient-of-variation of v·d²
//
// For a perfect inverse-square source, every measurement satisfies v·d² = k.
// The best source estimate is the position where these estimates agree best
// (lowest CV). A multi-pass grid search finds this position, with a
// tie-breaker preferring positions farther from measurements (avoids placing
// the source between measurements, which creates a near-source singularity).
// ---------------------------------------------------------------------------

/** CV of v·d² at candidate source (sx, sy). Lower = better inverse-square fit. */
function invSquareCV(
  points: DataPoint[],
  sx: number,
  sy: number
): number {
  if (points.length < 2) return Infinity;
  let sum = 0,
    sumSq = 0,
    n = 0;
  for (const p of points) {
    const dx = p.x - sx;
    const dy = p.y - sy;
    const dSq = dx * dx + dy * dy;
    if (dSq < 1e-6) continue;
    const vd2 = p.value * dSq;
    sum += vd2;
    sumSq += vd2 * vd2;
    n++;
  }
  if (n < 2) return Infinity;
  const mean = sum / n;
  if (mean < 1e-30) return Infinity;
  const variance = sumSq / n - mean * mean;
  return Math.sqrt(Math.max(0, variance)) / mean;
}

/** Squared distance from (sx, sy) to the nearest measurement point. */
function minDistSq(
  points: DataPoint[],
  sx: number,
  sy: number
): number {
  let min = Infinity;
  for (const p of points) {
    const dx = p.x - sx;
    const dy = p.y - sy;
    min = Math.min(min, dx * dx + dy * dy);
  }
  return min;
}

function findSource(points: DataPoint[]): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return { x: points[0].x, y: points[0].y };

  // Bounding box of measurements
  let bbMinX = Infinity,
    bbMaxX = -Infinity,
    bbMinY = Infinity,
    bbMaxY = -Infinity;
  for (const p of points) {
    bbMinX = Math.min(bbMinX, p.x);
    bbMaxX = Math.max(bbMaxX, p.x);
    bbMinY = Math.min(bbMinY, p.y);
    bbMaxY = Math.max(bbMaxY, p.y);
  }
  const span = Math.max(bbMaxX - bbMinX, bbMaxY - bbMinY, 1);

  // Value-gradient direction: centroid → highest-value point
  const maxPt = points.reduce((best, p) =>
    p.value > best.value ? p : best
  );
  let meanX = 0,
    meanY = 0;
  for (const p of points) {
    meanX += p.x;
    meanY += p.y;
  }
  meanX /= points.length;
  meanY /= points.length;
  const gdx = maxPt.x - meanX;
  const gdy = maxPt.y - meanY;
  const gLen = Math.sqrt(gdx * gdx + gdy * gdy);

  // Search extension: derived from value ratios so the grid reaches the
  // "beyond highest-value" solution even when values are close.
  let ext = 5 * span;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      const pairDist = Math.sqrt(dx * dx + dy * dy);
      if (pairDist < 1e-6) continue;
      const svi = Math.sqrt(Math.max(points[i].value, 1e-30));
      const svj = Math.sqrt(Math.max(points[j].value, 1e-30));
      const denom = Math.abs(svi - svj);
      if (denom > 0.01 * Math.max(svi, svj)) {
        ext = Math.max(ext, 1.5 * Math.min(svi, svj) * pairDist / denom);
      }
    }
  }
  ext = Math.min(ext, 20 * span);

  // Build search area: bbox + 1×span padding + extension along gradient
  let sMinX = bbMinX - span,
    sMaxX = bbMaxX + span,
    sMinY = bbMinY - span,
    sMaxY = bbMaxY + span;
  if (gLen > 1e-6) {
    const ndx = gdx / gLen;
    const ndy = gdy / gLen;
    const extX = maxPt.x + ext * ndx;
    const extY = maxPt.y + ext * ndy;
    sMinX = Math.min(sMinX, extX);
    sMaxX = Math.max(sMaxX, extX);
    sMinY = Math.min(sMinY, extY);
    sMaxY = Math.max(sMaxY, extY);
  } else {
    sMinX -= ext;
    sMaxX += ext;
    sMinY -= ext;
    sMaxY += ext;
  }

  // Multi-pass grid search (3 passes, 21×21 each, refining around best)
  let bestX = meanX,
    bestY = meanY,
    bestCv = invSquareCV(points, meanX, meanY),
    bestMd = minDistSq(points, meanX, meanY);

  const GRID = 20;
  for (let pass = 0; pass < 3; pass++) {
    const stepX = (sMaxX - sMinX) / GRID;
    const stepY = (sMaxY - sMinY) / GRID;

    for (let i = 0; i <= GRID; i++) {
      for (let j = 0; j <= GRID; j++) {
        const sx = sMinX + i * stepX;
        const sy = sMinY + j * stepY;
        const cv = invSquareCV(points, sx, sy);
        const md = minDistSq(points, sx, sy);
        // Lower CV wins; within 5% tolerance prefer farther from measurements
        if (cv < bestCv * 0.95 || (cv <= bestCv * 1.05 && md > bestMd)) {
          bestCv = cv;
          bestMd = md;
          bestX = sx;
          bestY = sy;
        }
      }
    }

    // Refine around best
    const margin = Math.max(stepX, stepY) * 2;
    sMinX = bestX - margin;
    sMaxX = bestX + margin;
    sMinY = bestY - margin;
    sMaxY = bestY + margin;
  }

  return { x: bestX, y: bestY };
}

// ---------------------------------------------------------------------------
// Source-strength fit: robust median estimator
//
// Each measurement yields an estimate k̂ᵢ = vᵢ · dᵢ².  The median is used
// instead of mean or weighted-LS because:
//  • it is not biased toward the closest point (the old 1/d⁴-weighted LS
//    let one nearby measurement dominate, making k too small)
//  • it is robust to shielded measurements (which produce low k̂ᵢ outliers)
// ---------------------------------------------------------------------------

function fitK(
  points: DataPoint[],
  srcX: number,
  srcY: number,
  mpp: number
): number {
  const estimates: number[] = [];
  for (const p of points) {
    const dx = (p.x - srcX) * mpp;
    const dy = (p.y - srcY) * mpp;
    const dSq = dx * dx + dy * dy;
    if (dSq < 1e-6) continue; // skip measurements coincident with source
    estimates.push(p.value * dSq);
  }
  if (estimates.length === 0) return 0;
  estimates.sort((a, b) => a - b);
  const mid = estimates.length >> 1;
  return estimates.length % 2 === 1
    ? estimates[mid]
    : (estimates[mid - 1] + estimates[mid]) / 2;
}

// ---------------------------------------------------------------------------
// Angular IDW shielding interpolation
// Uses circular distance metric: 1 − cos(Δθ)  ∈ [0, 2]
// ---------------------------------------------------------------------------

const ANGULAR_EPS = 0.02; // prevents division-by-zero at exact same angle

function interpolateShielding(
  theta: number,
  angles: Float64Array,
  shielding: Float64Array
): number {
  if (angles.length === 0) return 1;
  if (angles.length === 1) return shielding[0];

  let wSum = 0,
    wsSum = 0;
  for (let i = 0; i < angles.length; i++) {
    // Circular distance: 0 at same angle, 2 at opposite
    const dAngle = 1 - Math.cos(theta - angles[i]);
    const w = 1 / (dAngle + ANGULAR_EPS);
    wSum += w;
    wsSum += w * shielding[i];
  }
  return wsSum / wSum;
}

// ---------------------------------------------------------------------------
// Public helper — value at 1 m (unshielded source strength)
// ---------------------------------------------------------------------------

export function valueAt1m(state: InvSquareState): number {
  return state.k;
}

// ---------------------------------------------------------------------------
// Algorithm definition
// ---------------------------------------------------------------------------

const MIN_DIST_M = 0.5; // clamp distance to avoid singularity near source

export const invSquareAlgorithm: InterpolationAlgorithm<InvSquareState> = {
  id: 'inv-square',
  label: 'Inverse-Square + Shielding',
  description:
    'Strahlenquelle (Inverse-Square): Schätzt Quellposition und -stärke aus den Messwerten. ' +
    'Berücksichtigt Abschirmung über richtungsabhängige Restanalyse. ' +
    'Geeignet für Strahlung und andere punktförmige Quellen.',
  ignoreLogScale: true,
  params: [
    {
      key: 'fullCanvasRender',
      label: 'Gesamte Karte rendern (Quellfeld über Messbereich hinaus)',
      type: 'boolean',
      default: false,
    },
  ],

  fullCanvasRender: (state: InvSquareState) => state.fullCanvasRender,

  prepare(
    points: DataPoint[],
    params: Record<string, number | boolean>
  ): InvSquareState {
    const mpp =
      typeof params._metersPerPixel === 'number' ? params._metersPerPixel : 1;
    const fullCanvas =
      typeof params.fullCanvasRender === 'boolean'
        ? params.fullCanvasRender
        : false;

    if (points.length === 0) {
      return {
        sourceX: 0,
        sourceY: 0,
        k: 0,
        metersPerPixel: mpp,
        angles: new Float64Array(0),
        shielding: new Float64Array(0),
        fullCanvasRender: fullCanvas,
      };
    }

    // Source location
    const src = findSource(points);
    const srcX = src.x;
    const srcY = src.y;

    // Source strength
    const k = fitK(points, srcX, srcY, mpp);

    // Per-measurement angle and shielding factor
    const angles = new Float64Array(points.length);
    const shielding = new Float64Array(points.length);
    for (let i = 0; i < points.length; i++) {
      const dx = (points[i].x - srcX) * mpp;
      const dy = (points[i].y - srcY) * mpp;
      const dSq = dx * dx + dy * dy;
      angles[i] = Math.atan2(dy, dx);
      if (dSq < 1e-6 || k < 1e-30) {
        shielding[i] = 1;
      } else {
        shielding[i] = Math.min(1, Math.max(0, points[i].value / (k / dSq)));
      }
    }

    return {
      sourceX: srcX,
      sourceY: srcY,
      k,
      metersPerPixel: mpp,
      angles,
      shielding,
      fullCanvasRender: fullCanvas,
    };
  },

  evaluate(x: number, y: number, state: InvSquareState): number {
    if (state.k <= 0) return 0;

    const dx = (x - state.sourceX) * state.metersPerPixel;
    const dy = (y - state.sourceY) * state.metersPerPixel;
    const dm = Math.sqrt(dx * dx + dy * dy);
    const dmClamped = Math.max(dm, MIN_DIST_M);

    const theta = Math.atan2(dy, dx);
    const s = interpolateShielding(theta, state.angles, state.shielding);

    return Math.max(0, (state.k / (dmClamped * dmClamped)) * s);
  },
};
