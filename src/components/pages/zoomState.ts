/**
 * Pure reducer functions for the spectrum-chart zoom/pan state. Kept in a
 * plain module so they are unit-testable without DOM. The actual
 * xRange/yRange React state lives inside `ZoomableSpectrumChart`.
 */

export type Range = [number, number];

/**
 * Zoom the given range around a pivot point. `delta < 0` zooms in (range
 * shrinks); `delta > 0` zooms out. `factor` controls the zoom step size — a
 * factor of 2 doubles/halves the span per step. The pivot stays at the same
 * fractional position within the new range, so zooming under the cursor keeps
 * the cursor's data value anchored.
 */
export function applyWheelZoom(
  range: Range,
  pivot: number,
  delta: number,
  factor = 1.2,
): Range {
  const [a, b] = range;
  if (b <= a) return range;
  const scale = delta < 0 ? 1 / factor : factor;
  const span = b - a;
  const newSpan = span * scale;
  const leftFrac = (pivot - a) / span;
  const newA = pivot - newSpan * leftFrac;
  const newB = newA + newSpan;
  return [newA, newB];
}

/**
 * Shift both range boundaries by `deltaKev` (positive = pan right).
 */
export function applyPan(range: Range, deltaKev: number): Range {
  return [range[0] + deltaKev, range[1] + deltaKev];
}

/**
 * Return a fresh copy of the default range. Useful for double-tap / reset
 * actions so the consumer doesn't leak the default reference.
 */
export function resetRange(defaultRange: Range): Range {
  return [...defaultRange] as Range;
}
