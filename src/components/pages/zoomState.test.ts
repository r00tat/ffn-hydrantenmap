import { describe, expect, it } from 'vitest';
import { applyWheelZoom, applyPan, resetRange } from './zoomState';

describe('zoomState', () => {
  it('wheel zoom-in halbiert die Breite um die Cursor-Position', () => {
    const r = applyWheelZoom([0, 1000], 500, -1); // delta<0 = zoom in
    // Default factor 1.2 → scale = 1/1.2 ≈ 0.833, new span = 1000 * 0.833 ≈ 833.3
    // pivot at 500 (center, leftFrac = 0.5) → [83.33…, 916.66…]
    expect(r[0]).toBeCloseTo(500 - (1000 / 1.2) / 2, 5);
    expect(r[1]).toBeCloseTo(500 + (1000 / 1.2) / 2, 5);
  });

  it('wheel zoom-in mit factor 2 halbiert die Breite um die Cursor-Position', () => {
    const r = applyWheelZoom([0, 1000], 500, -1, 2);
    expect(r).toEqual([250, 750]);
  });

  it('pan verschiebt beide Grenzen um dx (in keV)', () => {
    const r = applyPan([100, 200], 30);
    expect(r).toEqual([130, 230]);
  });

  it('reset liefert default range zurück', () => {
    expect(resetRange([0, 3000])).toEqual([0, 3000]);
  });

  it('wheel zoom-out verdoppelt die Breite um die Cursor-Position', () => {
    const r = applyWheelZoom([250, 750], 500, 1, 2);
    expect(r).toEqual([0, 1000]);
  });

  it('wheel zoom respektiert die Cursor-Position am linken Rand', () => {
    // pivot at 0 (leftFrac = 0) → new range = [0, newSpan]
    const r = applyWheelZoom([0, 1000], 0, -1, 2);
    expect(r).toEqual([0, 500]);
  });
});
