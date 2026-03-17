import type { DataPoint, InterpolationAlgorithm, TpsWeights } from './types';

// ---------------------------------------------------------------------------
// Thin-Plate Spline (TPS) Interpolation
// Moved from interpolation.ts — no logic changes.
// ---------------------------------------------------------------------------

/**
 * TPS radial basis function: φ(r) = r² ln(r), with φ(0) = 0.
 */
function tpsPhi(r: number): number {
  if (r < 1e-10) return 0;
  return r * r * Math.log(r);
}

/**
 * Solve the Thin-Plate Spline system for the given data points.
 * Returns weights and polynomial coefficients.
 *
 * Coordinates are center-and-scale normalized to [-1, 1] (like scipy's
 * RBFInterpolator) so that φ(r) = r²ln(r) stays well-conditioned.
 *
 * Tikhonov regularization (λ scaled to K matrix magnitude, like MATLAB's
 * tpaps) damps overshoot from high-value outlier points.
 *
 * Uses Gaussian elimination with partial pivoting.
 * Suitable for n ≤ 300 points (O(n²) memory, O(n³) time — done once per render).
 *
 * @param lambda Tikhonov regularization factor (default 0.1), scaled relative
 *   to average |K| entry. 0 = exact interpolation, higher = smoother surface.
 */
export function solveTPS(points: DataPoint[], lambda = 0.1): TpsWeights {
  const n = points.length;
  const size = n + 3;

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  let dataMin = Infinity;
  for (let i = 0; i < n; i++) {
    if (points[i].x < minX) minX = points[i].x;
    if (points[i].x > maxX) maxX = points[i].x;
    if (points[i].y < minY) minY = points[i].y;
    if (points[i].y > maxY) maxY = points[i].y;
    if (points[i].value < dataMin) dataMin = points[i].value;
  }
  const shiftX = (maxX + minX) / 2;
  const shiftY = (maxY + minY) / 2;
  const scale = Math.max(maxX - minX, maxY - minY, 1e-10) / 2;

  const A = new Float64Array(size * size);
  const b = new Float64Array(size);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const dx = (points[i].x - points[j].x) / scale;
      const dy = (points[i].y - points[j].y) / scale;
      const r = Math.sqrt(dx * dx + dy * dy);
      A[i * size + j] = tpsPhi(r);
    }
  }

  let kAbsSum = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      kAbsSum += Math.abs(A[i * size + j]);
    }
  }
  const kAvg = kAbsSum / (n * n) || 1;
  const effectiveLambda = lambda * kAvg;
  for (let i = 0; i < n; i++) {
    A[i * size + i] += effectiveLambda;
  }

  for (let i = 0; i < n; i++) {
    const xn = (points[i].x - shiftX) / scale;
    const yn = (points[i].y - shiftY) / scale;
    A[i * size + n] = 1;
    A[i * size + n + 1] = xn;
    A[i * size + n + 2] = yn;
    A[n * size + i] = 1;
    A[(n + 1) * size + i] = xn;
    A[(n + 2) * size + i] = yn;
  }

  for (let i = 0; i < n; i++) {
    b[i] = points[i].value;
  }

  // Gaussian elimination with partial pivoting
  for (let col = 0; col < size; col++) {
    let maxVal = Math.abs(A[col * size + col]);
    let maxRow = col;
    for (let row = col + 1; row < size; row++) {
      const v = Math.abs(A[row * size + col]);
      if (v > maxVal) {
        maxVal = v;
        maxRow = row;
      }
    }
    if (maxRow !== col) {
      for (let k = 0; k < size; k++) {
        const tmp = A[col * size + k];
        A[col * size + k] = A[maxRow * size + k];
        A[maxRow * size + k] = tmp;
      }
      const tmp = b[col];
      b[col] = b[maxRow];
      b[maxRow] = tmp;
    }
    const pivot = A[col * size + col];
    if (Math.abs(pivot) < 1e-14) continue;
    for (let row = col + 1; row < size; row++) {
      const factor = A[row * size + col] / pivot;
      for (let k = col; k < size; k++) {
        A[row * size + k] -= factor * A[col * size + k];
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

  return {
    w: x.slice(0, n),
    a: x.slice(n, n + 3),
    points,
    shiftX,
    shiftY,
    scale,
    dataMin,
  };
}

/**
 * Evaluate a solved TPS at point (x, y).
 * Applies the same center-and-scale normalization used during solveTPS.
 * Result is clamped to the data value range to prevent extrapolation overshoot.
 */
export function evaluateTPS(x: number, y: number, tps: TpsWeights): number {
  const xn = (x - tps.shiftX) / tps.scale;
  const yn = (y - tps.shiftY) / tps.scale;
  let value = tps.a[0] + tps.a[1] * xn + tps.a[2] * yn;
  const pts = tps.points;
  for (let i = 0; i < pts.length; i++) {
    const dx = xn - (pts[i].x - tps.shiftX) / tps.scale;
    const dy = yn - (pts[i].y - tps.shiftY) / tps.scale;
    const r = Math.sqrt(dx * dx + dy * dy);
    value += tps.w[i] * tpsPhi(r);
  }
  return Math.max(tps.dataMin, value);
}

export const splineAlgorithm: InterpolationAlgorithm<TpsWeights> = {
  id: 'spline',
  label: 'Thin-Plate Spline',
  minPoints: 3,
  description:
    'Spline (Thin-Plate): Glatte Fläche durch alle Messpunkte – kann Werte außerhalb des gemessenen Bereichs schätzen. Gut für physikalische Felder wie Strahlung oder Temperatur.',
  params: [
    {
      key: 'logScale',
      label: 'Logarithmische Interpolation',
      type: 'boolean',
      default: false,
    },
  ],

  prepare(points: DataPoint[], params: Record<string, number | boolean>): TpsWeights {
    if (points.length < 3) {
      return {
        w: new Float64Array(0),
        a: new Float64Array(3),
        points,
        shiftX: 0,
        shiftY: 0,
        scale: 1,
        dataMin: points.length > 0 ? Math.min(...points.map((p) => p.value)) : 0,
      };
    }
    const lambda = typeof params._lambda === 'number' ? params._lambda : undefined;
    return solveTPS(points, lambda);
  },

  evaluate(x: number, y: number, state: TpsWeights): number {
    if (state.w.length === 0) return 0;
    return evaluateTPS(x, y, state);
  },
};
