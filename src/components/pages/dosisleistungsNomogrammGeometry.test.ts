import { describe, expect, it } from 'vitest';
import { falloutDoseRate } from '../../common/strahlenschutz';
import {
  BOTTOM,
  CHART_CENTER_Y,
  inRangeR,
  inRangeT,
  R_MAX,
  R_MIN,
  TOP,
  X_LEFT,
  X_MID,
  X_RIGHT,
  yLeftR,
  yLineAtMid,
  yMidT,
  yRightR1,
} from './dosisleistungsNomogrammGeometry';

describe('Dosisleistungs-Nomogramm geometry', () => {
  describe('left R(t) scale', () => {
    it('places R_MIN at the bottom', () => {
      expect(yLeftR(R_MIN)).toBeCloseTo(BOTTOM, 5);
    });

    it('places R_MAX at the top', () => {
      expect(yLeftR(R_MAX)).toBeCloseTo(TOP, 5);
    });

    it('is monotonically decreasing (higher R → smaller y)', () => {
      expect(yLeftR(1)).toBeGreaterThan(yLeftR(10));
      expect(yLeftR(10)).toBeGreaterThan(yLeftR(100));
    });

    it('spans one decade as one sixth of the chart height', () => {
      // 6 decades cover full chart height
      const oneDecade = yLeftR(1) - yLeftR(10);
      const range = BOTTOM - TOP;
      expect(oneDecade).toBeCloseTo(range / 6);
    });
  });

  describe('right R₁ scale (inverted)', () => {
    it('places R_MIN at the top (inverted)', () => {
      expect(yRightR1(R_MIN)).toBeCloseTo(TOP, 5);
    });

    it('places R_MAX at the bottom (inverted)', () => {
      expect(yRightR1(R_MAX)).toBeCloseTo(BOTTOM, 5);
    });

    it('is monotonically increasing (higher R₁ → larger y)', () => {
      expect(yRightR1(1)).toBeLessThan(yRightR1(10));
      expect(yRightR1(10)).toBeLessThan(yRightR1(100));
    });
  });

  describe('middle t scale', () => {
    it('places t = 1 exactly at the chart center', () => {
      expect(yMidT(1)).toBeCloseTo(CHART_CENTER_Y, 5);
    });

    it('places small t above center, large t below', () => {
      expect(yMidT(0.5)).toBeLessThan(CHART_CENTER_Y);
      expect(yMidT(2)).toBeGreaterThan(CHART_CENTER_Y);
    });

    it('is symmetric around t = 1 (1/t reflects across center)', () => {
      const above = CHART_CENTER_Y - yMidT(0.1);
      const below = yMidT(10) - CHART_CENTER_Y;
      expect(above).toBeCloseTo(below);
    });
  });

  describe('parallel-scale property (line method)', () => {
    // For valid (rt, r1, t) with rt = r1 · t^(-1.2), the three points should
    // be collinear: yMidT(t) must equal the y of the line at X_MID.
    const cases: Array<{ r1: number; t: number }> = [
      { r1: 100, t: 1 },
      { r1: 100, t: 2 },
      { r1: 100, t: 0.5 },
      { r1: 300, t: 4 },
      { r1: 50, t: 7 },
      { r1: 1000, t: 0.1 },
      { r1: 10, t: 100 },
    ];

    cases.forEach(({ r1, t }) => {
      it(`R₁=${r1}, t=${t}h: three points are collinear`, () => {
        const rt = falloutDoseRate(r1, t);
        const yLineMid = yLineAtMid(rt, r1);
        const yScaleMid = yMidT(t);
        expect(yScaleMid).toBeCloseTo(yLineMid, 4);
      });
    });

    it('FM 3-3-1 reference: R₁=300, t=2 → R(t)≈130.6, all on the line', () => {
      const r1 = 300;
      const t = 2;
      const rt = falloutDoseRate(r1, t);
      expect(rt).toBeCloseTo(300 * Math.pow(2, -1.2));
      expect(yMidT(t)).toBeCloseTo(yLineAtMid(rt, r1), 4);
    });

    it('7-10 rule: at t=7, R(t)=R₁/10.39, points collinear', () => {
      const r1 = 1000;
      const t = 7;
      const rt = falloutDoseRate(r1, t);
      expect(rt).toBeCloseTo(r1 / Math.pow(7, 1.2));
      expect(yMidT(t)).toBeCloseTo(yLineAtMid(rt, r1), 4);
    });

    it('non-collinear when relationship does NOT hold', () => {
      // R(t) chosen NOT to match: line midpoint differs from t-scale position
      const r1 = 100;
      const t = 2;
      const rtCorrect = falloutDoseRate(r1, t); // ≈ 43.5
      const rtWrong = rtCorrect * 2; // double — relationship broken
      expect(yMidT(t)).not.toBeCloseTo(yLineAtMid(rtWrong, r1), 1);
    });
  });

  describe('axes positions', () => {
    it('X_MID is the geometric midpoint of X_LEFT and X_RIGHT', () => {
      expect(X_MID).toBe((X_LEFT + X_RIGHT) / 2);
    });

    it('chart-center y equals midpoint of TOP and BOTTOM', () => {
      expect(CHART_CENTER_Y).toBe((TOP + BOTTOM) / 2);
    });
  });

  describe('range checks', () => {
    it('inRangeR accepts values inside the scale', () => {
      expect(inRangeR(R_MIN)).toBe(true);
      expect(inRangeR(R_MAX)).toBe(true);
      expect(inRangeR(1)).toBe(true);
    });

    it('inRangeR rejects out-of-range and null', () => {
      expect(inRangeR(R_MIN / 10)).toBe(false);
      expect(inRangeR(R_MAX * 10)).toBe(false);
      expect(inRangeR(null)).toBe(false);
    });

    it('inRangeT requires positive t', () => {
      expect(inRangeT(0.001)).toBe(true);
      expect(inRangeT(1000)).toBe(true);
      expect(inRangeT(0)).toBe(false);
      expect(inRangeT(-1)).toBe(false);
      expect(inRangeT(null)).toBe(false);
    });
  });
});
