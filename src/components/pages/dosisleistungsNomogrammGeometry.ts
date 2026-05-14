/**
 * Geometrie/Skalierung des Dosisleistungs-Nomogramms.
 * Parallel-Skalen-Nomogramm für R(t) = R₁ · t^(-1,2).
 *
 * In Log-Form: log R₁ − log R(t) = 1,2 · log t.
 *
 * Drei vertikale Skalen mit Konstanten:
 *  - LEFT (x = X_LEFT): R(t). Große R(t) am oberen Rand, kleine unten.
 *  - RIGHT (x = X_RIGHT): R₁. **Invertiert** — kleine R₁ oben, große unten.
 *  - MIDDLE (x = X_MID, in der Mitte): t. Kleine t oben, große unten.
 *
 * Aus der Mittelpunkt-Konstruktion folgt für die Mittelskala:
 *   y_M(t) = TOP + CHART_H/2 + 0,6 · SCALE_PX · log10(t)
 * mit SCALE_PX = CHART_H / log10(R_MAX / R_MIN). Dadurch liegen die drei
 * Punkte exakt auf einer Geraden, wenn R(t) = R₁ · t^(-1,2) erfüllt ist.
 */

export const VB_W = 720;
export const VB_H = 520;
export const TOP = 70;
export const BOTTOM = 470;
export const CHART_H = BOTTOM - TOP;
export const X_LEFT = 100;
export const X_MID = 360;
export const X_RIGHT = 620;

export const R_MIN = 0.01;
export const R_MAX = 10000;
export const LOG_R_MIN = Math.log10(R_MIN); // -2
export const LOG_R_MAX = Math.log10(R_MAX); // 4
export const LOG_R_RANGE = LOG_R_MAX - LOG_R_MIN; // 6
export const SCALE_PX = CHART_H / LOG_R_RANGE; // px per decade
export const T_SCALE_PX = 0.6 * SCALE_PX;
export const CHART_CENTER_Y = TOP + CHART_H / 2;

/** y-Position auf der linken R(t)-Skala. Große R(t) oben (kleines y). */
export function yLeftR(r: number): number {
  return TOP + SCALE_PX * (LOG_R_MAX - Math.log10(r));
}

/** y-Position auf der rechten R₁-Skala. **Invertiert**: kleine R₁ oben. */
export function yRightR1(r1: number): number {
  return TOP + SCALE_PX * (Math.log10(r1) - LOG_R_MIN);
}

/** y-Position auf der mittleren t-Skala. t = 1 liegt exakt in der Mitte. */
export function yMidT(t: number): number {
  return CHART_CENTER_Y + T_SCALE_PX * Math.log10(t);
}

/**
 * y-Position des Schnittpunkts der geraden Verbindungslinie von (X_LEFT, yLeftR(rt))
 * nach (X_RIGHT, yRightR1(r1)) bei x = X_MID. Sollte yMidT(t) entsprechen,
 * wenn rt = r1 · t^(-1,2) gilt.
 */
export function yLineAtMid(rt: number, r1: number): number {
  return (yLeftR(rt) + yRightR1(r1)) / 2;
}

export function inRangeR(r: number | null): r is number {
  return r !== null && r >= R_MIN && r <= R_MAX;
}

export function inRangeT(t: number | null): t is number {
  return t !== null && t > 0;
}
