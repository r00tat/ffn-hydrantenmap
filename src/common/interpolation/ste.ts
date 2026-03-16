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
