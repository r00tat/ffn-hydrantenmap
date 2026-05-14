/**
 * Geometrie/Skalierung des Dosis-Nomogramms (FM 3-3-1, 5 Skalen).
 *
 * Konstruktion in zwei Schritten:
 *   1) Te ↔ Ts ↔ Bezugslinie (M = D/R₁)
 *   2) Bezugslinie ↔ R₁ ↔ D
 *
 * Beziehung:
 *   M = 5 · ( Te^(-0,2) − (Te + Ts)^(-0,2) )
 *   D = R₁ · M
 *
 * Layout (von links nach rechts):
 *   D | R₁ | Bezugslinie M | Ts | Te
 *
 * Alle Skalen logarithmisch positioniert; D, R₁, M haben große Werte oben
 * (Gefahrenkonvention), Te und Ts haben kleine Zeiten oben.
 */

export const VB_W = 760;
export const VB_H = 540;
export const TOP = 80;
export const BOTTOM = 480;
export const CHART_H = BOTTOM - TOP;

// Fünf vertikale Skalenpositionen, gleichmäßig verteilt
export const X_D = 80;
export const X_R1 = 230;
export const X_PIVOT = 380;
export const X_TS = 530;
export const X_TE = 680;

// Wertebereiche
export const D_MIN = 0.01;
export const D_MAX = 10000;
export const R1_MIN = 0.01;
export const R1_MAX = 10000;
export const M_MIN = 0.001;
export const M_MAX = 10;
export const T_MIN = 0.1;
export const T_MAX = 1000;

const LOG_D_RANGE = Math.log10(D_MAX / D_MIN);
const LOG_R1_RANGE = Math.log10(R1_MAX / R1_MIN);
const LOG_M_RANGE = Math.log10(M_MAX / M_MIN);
const LOG_T_RANGE = Math.log10(T_MAX / T_MIN);

export const SCALE_D = CHART_H / LOG_D_RANGE;
export const SCALE_R1 = CHART_H / LOG_R1_RANGE;
export const SCALE_M = CHART_H / LOG_M_RANGE;
export const SCALE_T = CHART_H / LOG_T_RANGE;

// === Skalenpositionen ===

/** D-Skala (links). Große D oben (kleines y). */
export function yD(d: number): number {
  return TOP + SCALE_D * (Math.log10(D_MAX) - Math.log10(d));
}

/** R₁-Skala. Große R₁ oben. */
export function yR1(r1: number): number {
  return TOP + SCALE_R1 * (Math.log10(R1_MAX) - Math.log10(r1));
}

/** Bezugslinie (Multiplikator M). Große M oben. */
export function yPivot(m: number): number {
  return TOP + SCALE_M * (Math.log10(M_MAX) - Math.log10(m));
}

/** Ts-Skala. Kleine Ts oben (natürliche Zeitachse). */
export function yTs(ts: number): number {
  return TOP + SCALE_T * (Math.log10(ts) - Math.log10(T_MIN));
}

/** Te-Skala. Kleine Te oben. */
export function yTe(te: number): number {
  return TOP + SCALE_T * (Math.log10(te) - Math.log10(T_MIN));
}

// === Beziehungs-Helfer ===

/** Multiplikator aus Dosis und Bezugsdosisleistung: M = D / R₁. */
export function mFromDoseAndR1(d: number, r1: number): number {
  return d / r1;
}

/** Multiplikator aus Eintritts- und Aufenthaltszeit (Way-Wigner-Integral). */
export function mFromTeTs(te: number, ts: number): number {
  return 5 * (Math.pow(te, -0.2) - Math.pow(te + ts, -0.2));
}

// === Range-Checks ===

export function inRangeD(d: number | null): d is number {
  return d !== null && d >= D_MIN && d <= D_MAX;
}
export function inRangeR1(r1: number | null): r1 is number {
  return r1 !== null && r1 >= R1_MIN && r1 <= R1_MAX;
}
export function inRangeM(m: number | null): m is number {
  return m !== null && m >= M_MIN && m <= M_MAX;
}
export function inRangeTime(t: number | null): t is number {
  return t !== null && t >= T_MIN && t <= T_MAX;
}
