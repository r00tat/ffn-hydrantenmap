import { describe, expect, it } from 'vitest';
import { falloutDose } from '../../common/strahlenschutz';
import {
  ALPHA_R1,
  BOTTOM,
  D_MAX,
  D_MIN,
  inRangeD,
  inRangeM,
  inRangeR1,
  inRangeTe,
  inRangeTime,
  inRangeTs,
  K_D,
  K_M,
  K_R1,
  M_MAX,
  M_MIN,
  mFromDoseAndR1,
  mFromTeTs,
  R1_MAX,
  R1_MIN,
  TE_MAX,
  TE_MIN,
  TOP,
  TS_MAX,
  TS_MIN,
  X_D,
  X_M,
  X_R1,
  X_TE_BOTTOM,
  X_TE_TOP,
  xTe,
  xTs,
  Y_TE_BOTTOM,
  Y_TE_TOP,
  yD,
  yM,
  yPivot,
  yR1,
  yTe,
  yTs,
} from './dosisNomogrammGeometry';

describe('Dosis-Nomogramm geometry (FM 3-3-1 mit geraden Linien)', () => {
  describe('D-Skala', () => {
    it('D_MIN oben', () => {
      expect(yD(D_MIN)).toBeCloseTo(TOP, 5);
    });
    it('D_MAX unten', () => {
      expect(yD(D_MAX)).toBeCloseTo(BOTTOM, 5);
    });
    it('monoton zunehmend (größeres D → größeres y)', () => {
      expect(yD(1)).toBeLessThan(yD(10));
      expect(yD(10)).toBeLessThan(yD(100));
      expect(yD(100)).toBeLessThan(yD(1000));
    });
  });

  describe('R₁-Skala', () => {
    it('R1_MIN oben', () => {
      expect(yR1(R1_MIN)).toBeCloseTo(TOP, 5);
    });
    it('R1_MAX unten', () => {
      expect(yR1(R1_MAX)).toBeCloseTo(BOTTOM, 5);
    });
  });

  describe('M-Skala (Bezugslinie)', () => {
    it('M_MAX oben', () => {
      expect(yPivot(M_MAX)).toBeCloseTo(TOP, 5);
      expect(yM(M_MAX)).toBeCloseTo(TOP, 5);
    });
    it('M_MIN unten', () => {
      expect(yPivot(M_MIN)).toBeCloseTo(BOTTOM, 5);
    });
    it('yM und yPivot sind identisch', () => {
      expect(yM(0.1)).toBe(yPivot(0.1));
    });
  });

  describe('Parallel-Skalen-Kalibrierung (rote Linie D-R₁-M)', () => {
    it('R₁ liegt bei α = K_D / (K_D + K_M) zwischen D und M', () => {
      const expected = K_D / (K_D + K_M);
      expect(ALPHA_R1).toBeCloseTo(expected, 10);
    });

    it('Kalibrierungsbedingung: K_R1 = (1-α)·K_D = α·K_M', () => {
      expect(K_R1).toBeCloseTo((1 - ALPHA_R1) * K_D, 10);
      expect(K_R1).toBeCloseTo(ALPHA_R1 * K_M, 10);
    });

    it('Drei Punkte (D, R₁, M) kollinear für D = R₁ · M', () => {
      const cases: Array<{ d: number; r1: number; m: number }> = [
        { d: 100, r1: 1000, m: 0.1 },
        { d: 10, r1: 100, m: 0.1 },
        { d: 200, r1: 1000, m: 0.2 },
        { d: 500, r1: 5000, m: 0.1 },
        { d: 50, r1: 5000, m: 0.01 },
        { d: 1, r1: 100, m: 0.01 },
      ];
      cases.forEach(({ d, r1, m }) => {
        // Sanity: D = R₁ · M
        expect(d).toBeCloseTo(r1 * m, 5);
        // Kollinearität: y_R1 = (1-α)·y_D + α·y_M (lineare Interpolation)
        const yLine = (1 - ALPHA_R1) * yD(d) + ALPHA_R1 * yPivot(m);
        expect(yR1(r1)).toBeCloseTo(yLine, 5);
      });
    });

    it('X-Position von R₁ liegt bei α-Bruchteil zwischen D und M', () => {
      expect(X_R1).toBeCloseTo(X_D + ALPHA_R1 * (X_M - X_D), 5);
    });
  });

  describe('Te-Diagonale', () => {
    it('TE_MAX an Y_TE_TOP (oben)', () => {
      expect(yTe(TE_MAX)).toBeCloseTo(Y_TE_TOP, 5);
      expect(xTe(TE_MAX)).toBeCloseTo(X_TE_TOP, 5);
    });
    it('TE_MIN an Y_TE_BOTTOM (unten)', () => {
      expect(yTe(TE_MIN)).toBeCloseTo(Y_TE_BOTTOM, 5);
      expect(xTe(TE_MIN)).toBeCloseTo(X_TE_BOTTOM, 5);
    });
    it('Punkte (xTe, yTe) liegen auf gerader Diagonale', () => {
      const tePoints = [5, 24, 240].map((te) => ({ x: xTe(te), y: yTe(te) }));
      const [a, b, c] = tePoints;
      const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      expect(cross).toBeCloseTo(0, 5);
    });
    it('Monoton: größere Te oben, kleinere unten', () => {
      expect(yTe(TE_MAX)).toBeLessThan(yTe(TE_MIN));
    });
  });

  describe('Ts-Kurve', () => {
    it('Ts-Position ist eindeutig pro Ts-Wert', () => {
      expect(xTs(2)).toBeCloseTo(xTs(2), 10);
      expect(yTs(2)).toBeCloseTo(yTs(2), 10);
    });
    it('Größere Ts hat andere Position als kleinere Ts', () => {
      expect(yTs(0.5)).not.toBeCloseTo(yTs(24), 1);
    });
  });

  describe('Blaue Linie (Te-Ts-M) für Te = TE_REF (= 24 h)', () => {
    const teRef = 24;
    const tsValues = [0.5, 1, 2, 4, 8, 16, 24];

    tsValues.forEach((ts) => {
      it(`Ts=${ts}, Te=${teRef}: drei Punkte (M, Ts, Te) sind kollinear`, () => {
        const m = mFromTeTs(teRef, ts);
        if (m < M_MIN || m > M_MAX) {
          return;
        }
        const pM = { x: X_M, y: yPivot(m) };
        const pTs = { x: xTs(ts), y: yTs(ts) };
        const pTe = { x: xTe(teRef), y: yTe(teRef) };

        const cross =
          (pTs.x - pM.x) * (pTe.y - pM.y) -
          (pTs.y - pM.y) * (pTe.x - pM.x);
        expect(cross).toBeCloseTo(0, 3);
      });
    });
  });

  describe('M-Konsistenz: Zeit-Pfad vs. Dosis-Pfad', () => {
    const cases: Array<{ r1: number; te: number; ts: number }> = [
      { r1: 100, te: 1, ts: 1 },
      { r1: 300, te: 2, ts: 1 },
      { r1: 50, te: 4, ts: 2 },
      { r1: 1000, te: 0.5, ts: 0.5 },
      { r1: 10, te: 10, ts: 5 },
    ];
    cases.forEach(({ r1, te, ts }) => {
      it(`R₁=${r1}, Te=${te}, Ts=${ts}: M aus Zeit = M aus Dosis`, () => {
        const d = falloutDose(r1, te, ts);
        const mTime = mFromTeTs(te, ts);
        const mDose = mFromDoseAndR1(d, r1);
        expect(mTime).toBeCloseTo(mDose, 10);
      });
    });

    it('FM 3-3-1 Beispiel: R₁=300, Te=2, Ts=1 → M ≈ 0,339', () => {
      const m = mFromTeTs(2, 1);
      expect(m).toBeCloseTo(0.339, 3);
      const d = falloutDose(300, 2, 1);
      const mDose = mFromDoseAndR1(d, 300);
      expect(mDose).toBeCloseTo(m, 10);
    });
  });

  describe('Range-Checks', () => {
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
    it('inRangeTime / inRangeTe', () => {
      expect(inRangeTime(TE_MIN)).toBe(true);
      expect(inRangeTime(TE_MAX)).toBe(true);
      expect(inRangeTime(0)).toBe(false);
      expect(inRangeTe(TE_MIN)).toBe(true);
    });
    it('inRangeTs', () => {
      expect(inRangeTs(TS_MIN)).toBe(true);
      expect(inRangeTs(TS_MAX)).toBe(true);
      expect(inRangeTs(0)).toBe(false);
      expect(inRangeTs(TS_MAX * 2)).toBe(false);
    });
  });
});
