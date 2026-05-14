import { describe, expect, it } from 'vitest';
import { falloutDose } from '../../common/strahlenschutz';
import {
  BOTTOM,
  D_MAX,
  D_MIN,
  inRangeD,
  inRangeM,
  inRangeR1,
  inRangeTime,
  M_MAX,
  M_MIN,
  mFromDoseAndR1,
  mFromTeTs,
  R1_MAX,
  R1_MIN,
  T_MAX,
  T_MIN,
  TOP,
  yD,
  yPivot,
  yR1,
  yTe,
  yTs,
} from './dosisNomogrammGeometry';

describe('Dosis-Nomogramm geometry', () => {
  describe('D scale (left)', () => {
    it('places D_MAX at the top', () => {
      expect(yD(D_MAX)).toBeCloseTo(TOP, 5);
    });
    it('places D_MIN at the bottom', () => {
      expect(yD(D_MIN)).toBeCloseTo(BOTTOM, 5);
    });
    it('monotonically decreasing (higher D → smaller y)', () => {
      expect(yD(0.1)).toBeGreaterThan(yD(1));
      expect(yD(1)).toBeGreaterThan(yD(10));
      expect(yD(10)).toBeGreaterThan(yD(100));
    });
  });

  describe('R₁ scale', () => {
    it('places R1_MAX at the top', () => {
      expect(yR1(R1_MAX)).toBeCloseTo(TOP, 5);
    });
    it('places R1_MIN at the bottom', () => {
      expect(yR1(R1_MIN)).toBeCloseTo(BOTTOM, 5);
    });
    it('matches D scale spacing for shared values (both 6 decades)', () => {
      expect(yD(100)).toBeCloseTo(yR1(100));
    });
  });

  describe('Pivot (M) scale', () => {
    it('places M_MAX at the top', () => {
      expect(yPivot(M_MAX)).toBeCloseTo(TOP, 5);
    });
    it('places M_MIN at the bottom', () => {
      expect(yPivot(M_MIN)).toBeCloseTo(BOTTOM, 5);
    });
    it('M=1 sits exactly one quarter below the top (since log 1 = 0, range 0.001..10)', () => {
      // For M=1, log10(1)=0, log10(M_MAX/M)=log10(10)=1.
      // y = TOP + SCALE_M·1 = TOP + CHART_H/4 (since range = 4 decades)
      // i.e. ¼ of the way down.
      const expected = TOP + (BOTTOM - TOP) / 4;
      expect(yPivot(1)).toBeCloseTo(expected, 5);
    });
  });

  describe('Te / Ts time scales', () => {
    it('places T_MIN at the top (small times above)', () => {
      expect(yTe(T_MIN)).toBeCloseTo(TOP, 5);
      expect(yTs(T_MIN)).toBeCloseTo(TOP, 5);
    });
    it('places T_MAX at the bottom', () => {
      expect(yTe(T_MAX)).toBeCloseTo(BOTTOM, 5);
      expect(yTs(T_MAX)).toBeCloseTo(BOTTOM, 5);
    });
    it('Te and Ts share the same scale function', () => {
      expect(yTe(2.5)).toBe(yTs(2.5));
      expect(yTe(10)).toBe(yTs(10));
    });
    it('t = 1 h sits where log10(1/T_MIN) = log10(10) = 1 → ¼ down', () => {
      const expected = TOP + (BOTTOM - TOP) / 4;
      expect(yTe(1)).toBeCloseTo(expected, 5);
    });
  });

  describe('M consistency: time path vs dose path', () => {
    // For any consistent (R₁, Te, Ts) → D, the two M computations must agree.
    const cases: Array<{ r1: number; te: number; ts: number }> = [
      { r1: 100, te: 1, ts: 1 },
      { r1: 300, te: 2, ts: 1 },
      { r1: 50, te: 4, ts: 2 },
      { r1: 1000, te: 0.5, ts: 0.5 },
      { r1: 10, te: 10, ts: 5 },
    ];
    cases.forEach(({ r1, te, ts }) => {
      it(`R₁=${r1}, Te=${te}, Ts=${ts}: M from time = M from dose`, () => {
        const d = falloutDose(r1, te, ts);
        const mTime = mFromTeTs(te, ts);
        const mDose = mFromDoseAndR1(d, r1);
        expect(mTime).toBeCloseTo(mDose, 10);
      });
    });

    it('FM 3-3-1 example: R₁=300, Te=2, Ts=1 → M ≈ 0.339', () => {
      const m = mFromTeTs(2, 1);
      expect(m).toBeCloseTo(0.339, 3);
      const d = falloutDose(300, 2, 1);
      const mDose = mFromDoseAndR1(d, 300);
      expect(mDose).toBeCloseTo(m, 10);
    });
  });

  describe('Pivot position consistency: same M from both calculation paths', () => {
    it('matches yPivot for FM 3-3-1 example', () => {
      const te = 2;
      const ts = 1;
      const r1 = 300;
      const d = falloutDose(r1, te, ts);
      // Pivot point from time-path
      const yPivotFromTime = yPivot(mFromTeTs(te, ts));
      // Pivot point from dose-path
      const yPivotFromDose = yPivot(mFromDoseAndR1(d, r1));
      expect(yPivotFromTime).toBeCloseTo(yPivotFromDose, 10);
    });
  });

  describe('range checks', () => {
    it('inRangeD', () => {
      expect(inRangeD(0)).toBe(false);
      expect(inRangeD(null)).toBe(false);
      expect(inRangeD(D_MIN)).toBe(true);
      expect(inRangeD(D_MAX)).toBe(true);
      expect(inRangeD(D_MAX * 2)).toBe(false);
    });
    it('inRangeR1', () => {
      expect(inRangeR1(R1_MIN)).toBe(true);
      expect(inRangeR1(R1_MAX)).toBe(true);
      expect(inRangeR1(null)).toBe(false);
    });
    it('inRangeM', () => {
      expect(inRangeM(M_MIN)).toBe(true);
      expect(inRangeM(M_MAX)).toBe(true);
      expect(inRangeM(M_MAX * 10)).toBe(false);
    });
    it('inRangeTime', () => {
      expect(inRangeTime(T_MIN)).toBe(true);
      expect(inRangeTime(T_MAX)).toBe(true);
      expect(inRangeTime(0)).toBe(false);
    });
  });
});
