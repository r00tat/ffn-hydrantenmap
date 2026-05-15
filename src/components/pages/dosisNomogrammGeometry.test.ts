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
  yPivotExtrapolated,
  yR1,
  yTe,
  yTs,
} from './dosisNomogrammGeometry';

/** Orthogonal pixel distance from a point to the line through (a, b). */
function distancePointToLine(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}

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
    it('Te^(-0.2)-Parametrisierung: gleiche Te^(-0.2)-Differenz = gleicher y-Abstand', () => {
      // Mit u = Te^(-0.2) ist die Position linear in u. Zwei Te-Paare mit
      // gleicher u-Differenz sollten gleichen geometrischen Abstand haben.
      const yDiff1 = yTe(1) - yTe(10);
      const uDiff1 = Math.pow(1, -0.2) - Math.pow(10, -0.2);
      const yDiff2 = yTe(100) - yTe(1000);
      const uDiff2 = Math.pow(100, -0.2) - Math.pow(1000, -0.2);
      expect(yDiff1 / uDiff1).toBeCloseTo(yDiff2 / uDiff2, 5);
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
    it('xTs variiert mit Ts (keine vertikale Linie)', () => {
      const xs = [0.1, 0.5, 1, 2, 4, 8, 16, 24].map((ts) => xTs(ts));
      const range = Math.max(...xs) - Math.min(...xs);
      expect(range).toBeGreaterThan(2);
    });
    it('Größeres Ts liegt höher (kleineres y) als kleineres Ts (monoton)', () => {
      const tsVals = [0.1, 0.5, 1, 2, 4, 8, 16, 24];
      for (let i = 1; i < tsVals.length; i++) {
        expect(yTs(tsVals[i])).toBeLessThan(yTs(tsVals[i - 1]));
      }
    });
    it('Ts-Punkte liegen zwischen M-Achse und Te-Diagonale', () => {
      for (const ts of [0.1, 0.5, 1, 2, 8, 24]) {
        const x = xTs(ts);
        expect(x).toBeGreaterThan(X_M);
        expect(x).toBeLessThan(X_TE_BOTTOM);
      }
    });
  });

  describe('Blaue Linie (Te-Ts-M): LSQ-kalibrierte Genauigkeit', () => {
    // Mit LSQ-Kalibrierung über 128 log-verteilte Te-Anker ist die
    // Konstruktion nicht exakt, aber der maximale Fehler ist klein (~8 px).
    const tsValues = [0.1, 0.2, 0.5, 1, 2, 4, 8, 16, 24];
    const teValues = [0.5, 1, 2, 5, 10, 24, 48, 120, 240, 480, 720];

    it('Maximaler Ts-Abstand zur Te-M-Linie über alle (Te, Ts)-Paare < 10 px', () => {
      let maxDist = 0;
      let worst = '';
      for (const ts of tsValues) {
        for (const te of teValues) {
          const m = mFromTeTs(te, ts);
          const pM = { x: X_M, y: yPivotExtrapolated(m) };
          const pTs = { x: xTs(ts), y: yTs(ts) };
          const pTe = { x: xTe(te), y: yTe(te) };
          const d = distancePointToLine(pTs, pM, pTe);
          if (d > maxDist) {
            maxDist = d;
            worst = `Te=${te}, Ts=${ts}, d=${d.toFixed(2)}`;
          }
        }
      }
      expect(maxDist, `worst case: ${worst}`).toBeLessThan(10);
    });

    it('Durchschnittlicher Ts-Abstand zur Te-M-Linie < 4 px', () => {
      let sum = 0;
      let count = 0;
      for (const ts of tsValues) {
        for (const te of teValues) {
          const m = mFromTeTs(te, ts);
          const pM = { x: X_M, y: yPivotExtrapolated(m) };
          const pTs = { x: xTs(ts), y: yTs(ts) };
          const pTe = { x: xTe(te), y: yTe(te) };
          sum += distancePointToLine(pTs, pM, pTe);
          count++;
        }
      }
      expect(sum / count).toBeLessThan(4);
    });
  });

  describe('FM-3-3-1 Beispiele des Benutzers', () => {
    it('Te=6, Ts=1/3, R₁=282.58 → D=10.62', () => {
      expect(falloutDose(282.5798, 6, 1 / 3)).toBeCloseTo(10.62, 1);
    });
    it('Te=48, Ts=1, R₁=282.58 → D=2.68', () => {
      const d = falloutDose(282.5798, 48, 1);
      expect(d).toBeCloseTo(2.68, 1);
    });
    it('Te=48, Ts=1/3, R₁=282.58 → D=0.901', () => {
      const d = falloutDose(282.5798, 48, 1 / 3);
      expect(d).toBeCloseTo(0.901, 2);
    });

    // Mit der neuen LSQ-Kalibrierung sollte die blaue Linie auch für
    // diese Mittelfeld-Te-Werte sehr nahe durch Ts gehen.
    const constructionCases: Array<{ te: number; ts: number; label: string }> =
      [
        { te: 6, ts: 1 / 3, label: 'Te=6, Ts=20min' },
        { te: 24, ts: 1, label: 'Te=24h, Ts=1h' },
        { te: 48, ts: 1, label: 'Te=48h, Ts=1h' },
        { te: 48, ts: 1 / 3, label: 'Te=48h, Ts=20min' },
        { te: 120, ts: 2, label: 'Te=120h, Ts=2h' },
        { te: 240, ts: 4, label: 'Te=240h, Ts=4h' },
      ];

    constructionCases.forEach(({ te, ts, label }) => {
      it(`${label}: Ts-Punkt innerhalb 5 px der Te-M-Linie`, () => {
        const m = mFromTeTs(te, ts);
        const pM = { x: X_M, y: yPivotExtrapolated(m) };
        const pTs = { x: xTs(ts), y: yTs(ts) };
        const pTe = { x: xTe(te), y: yTe(te) };
        const d = distancePointToLine(pTs, pM, pTe);
        expect(d, `Abstand für ${label}: ${d.toFixed(2)} px`).toBeLessThan(5);
      });
    });
  });

  describe('Sichtbarkeit bei hohen Te-Werten (kleine M)', () => {
    it('yPivotExtrapolated extrapoliert linear für M < M_MIN', () => {
      // Eine Dekade kleiner M entspricht K_M Pixel weiter unten.
      const y1 = yPivotExtrapolated(M_MIN);
      const y2 = yPivotExtrapolated(M_MIN / 10);
      expect(y2 - y1).toBeCloseTo(K_M, 5);
      // yPivotExtrapolated bei M_MIN entspricht der Chart-Unterkante.
      expect(y1).toBeCloseTo(BOTTOM, 5);
    });
    it('Te=720, Ts=1: M ist sehr klein, Konstruktion bleibt definiert', () => {
      const te = 720;
      const ts = 1;
      const m = mFromTeTs(te, ts);
      expect(m).toBeGreaterThan(0);
      expect(m).toBeLessThan(M_MIN); // M außerhalb des Standard-Bereichs
      const y = yPivotExtrapolated(m);
      // Linie geht über die Chart-Unterkante hinaus, aber bleibt eine endliche Zahl
      expect(Number.isFinite(y)).toBe(true);
      expect(y).toBeGreaterThan(BOTTOM);
    });
  });

  describe('Sichtbarkeit bei kleinen Dosen (D < D_MIN)', () => {
    it('yD extrapoliert linear für D < D_MIN', () => {
      // Eine Dekade kleinere Dosis liegt K_D Pixel höher.
      const y1 = yD(D_MIN);
      const y2 = yD(D_MIN / 10);
      expect(y1 - y2).toBeCloseTo(K_D, 5);
      expect(y1).toBeCloseTo(TOP, 5);
    });
    it('Te=72h, Ts=20min, R₁=282.58: D≈0,55 mSv liegt unter D_MIN', () => {
      const r1 = 282.5798;
      const te = 72;
      const ts = 1 / 3;
      const d = falloutDose(r1, te, ts);
      expect(d).toBeCloseTo(0.5546, 3);
      expect(d).toBeLessThan(D_MIN);
      // Beide Endpunkte der roten Linie sind endlich; yD extrapoliert
      // oberhalb des Chart-Bereichs (kleines y), aber bleibt definiert.
      const m = mFromTeTs(te, ts);
      expect(Number.isFinite(yD(d))).toBe(true);
      expect(Number.isFinite(yPivotExtrapolated(m))).toBe(true);
    });
    it('Kollinearität M-R₁-D bleibt erhalten auch bei D < D_MIN', () => {
      // Für D = 0,5546, R₁ = 282,58, M = D/R₁ ≈ 0,001962 muss
      // y_R1(R₁) = (1−α)·yD(D) + α·yPivot(M) gelten.
      const d = 0.5546;
      const r1 = 282.5798;
      const m = d / r1;
      const yLine = (1 - ALPHA_R1) * yD(d) + ALPHA_R1 * yPivotExtrapolated(m);
      expect(yR1(r1)).toBeCloseTo(yLine, 3);
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
