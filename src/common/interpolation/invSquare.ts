import type { DataPoint, InterpolationAlgorithm } from './types';

// ---------------------------------------------------------------------------
// Inverse-Square + Directional Shielding (ISDS) interpolation
//
// Algorithm overview:
//  1. Locate source: grid-search the TPS surface peak → (sourceX, sourceY)
//  2. Fit source strength k: closed-form LS so that k/d² ≈ v for all points
//     k = Σ(vᵢ/dᵢ²) / Σ(1/dᵢ⁴)  (minimises Σ(k/dᵢ² − vᵢ)²)
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
// Source location: value-weighted centroid of measurements
//
// Physically motivated: the source is inferred to lie in the direction of
// highest field values. For ring measurements with one shielded sector the
// centroid shifts slightly away from that sector, placing the source estimate
// on the correct side. This is more robust than TPS peak search, which can
// have spurious maxima at extrapolation corners outside the measurement hull.
// ---------------------------------------------------------------------------

function findSource(points: DataPoint[]): { x: number; y: number } {
  let wSum = 0,
    wxSum = 0,
    wySum = 0;
  for (const p of points) {
    wSum += p.value;
    wxSum += p.value * p.x;
    wySum += p.value * p.y;
  }
  return wSum > 0
    ? { x: wxSum / wSum, y: wySum / wSum }
    : { x: 0, y: 0 };
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
