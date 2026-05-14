/**
 * Geometrie/Skalierung des Dosis-Nomogramms (FM 3-3-1).
 *
 * Konstruktion in zwei Schritten mit GERADEN Linien (FM 3-3-1 Variante 3):
 *
 *   Schritt 1 (blau, "Te → Ts → Bezugslinie"):
 *     Eine gerade Linie verbindet Te (Eintrittszeit) auf der diagonalen Skala
 *     mit Ts (Aufenthaltsdauer) auf der gekrümmten Skala und schneidet die
 *     Bezugslinie M.
 *
 *   Schritt 2 (rot, "Bezugslinie → R₁ → D"):
 *     Eine gerade Linie verbindet M, R₁ und D — drei parallele logarithmische
 *     Skalen, kalibriert nach der Mittellinien-Eigenschaft für log D = log R₁
 *     + log M.
 *
 * Gleichungen:
 *   M = 5 · (Te^(-0,2) − (Te + Ts)^(-0,2))   (RN-Strahlung, Way-Wigner)
 *   D = R₁ · M
 *
 * Layout (links → rechts): D | R₁ | M (Bezugslinie) | Ts (Kurve) | Te (Diagonal)
 *
 * Mathematische Kalibrierung der roten Linie (D-R₁-M):
 *   Drei vertikale Log-Skalen mit asymmetrischer Anordnung. Die R₁-Skala
 *   liegt bei Anteil α zwischen D und M; mit α = K_D / (K_D + K_M) und
 *   K_R1 = (1−α)·K_D = α·K_M ist die Gerade durch alle drei Punkte exakt.
 *
 * Kalibrierung der blauen Linie (Te-Ts-M):
 *   Te liegt auf einer geraden Diagonalen (log-Te-parametriert). Die
 *   Ts-Position wird so kalibriert, dass für einen Referenz-Te-Wert die
 *   Gerade von M durch Te genau die Ts-Markierung trifft. Da die Gleichung
 *   nicht separabel in Te und Ts ist, ist die Konstruktion für andere Te
 *   nur näherungsweise gerade (wie im FM 3-3-1 Original).
 */

export const VB_W = 820;
export const VB_H = 560;
export const TOP = 90;
export const BOTTOM = 490;
export const CHART_H = BOTTOM - TOP;

// === Wertebereiche (D, R₁, M abgestimmt für exakte Parallel-Skala) ===
// Bedingung: R1_MIN·M_MAX = D_MIN und R1_MAX·M_MIN = D_MAX (mit α = 0.5).
export const D_MIN = 1;
export const D_MAX = 1000;
export const R1_MIN = 1;
export const R1_MAX = 1000000;
export const M_MIN = 0.001;
export const M_MAX = 1;

// Zeitachsen (Stunden nach Detonation bzw. Aufenthaltsdauer)
export const TE_MIN = 0.5;
export const TE_MAX = 1000;
// Ts erlaubt sub-hour Werte (Minutenbereich). Untergrenze 0.05h ≈ 3 min.
export const TS_MIN = 0.05;
export const TS_MAX = 48;

const LOG_D_RANGE = Math.log10(D_MAX / D_MIN); // 3
const LOG_R1_RANGE = Math.log10(R1_MAX / R1_MIN); // 5
const LOG_M_RANGE = Math.log10(M_MAX / M_MIN); // 2
const LOG_TE_RANGE = Math.log10(TE_MAX / TE_MIN);

export const K_D = CHART_H / LOG_D_RANGE; // H/3
export const K_R1 = CHART_H / LOG_R1_RANGE; // H/5
export const K_M = CHART_H / LOG_M_RANGE; // H/2

// === X-Positionen der vertikalen Skalen ===
export const X_D = 90;
export const X_M = 380; // Bezugslinie zentral platziert

// α: Position der R₁-Skala zwischen D (α=0) und M (α=1)
// Bedingung Parallel-Skala: α = K_D / (K_D + K_M)
export const ALPHA_R1 = K_D / (K_D + K_M); // = 0.4 mit K_D=H/3, K_M=H/2
export const X_R1 = X_D + ALPHA_R1 * (X_M - X_D);

// === Diagonale Te-Skala ===
// Die Skala läuft von oben-links (großes Te = 10 Tage) nach unten-rechts
// (kleines Te = 5 h), als gerade Linie.
export const X_TE_TOP = 600;
export const Y_TE_TOP = TOP - 10;
export const X_TE_BOTTOM = 760;
export const Y_TE_BOTTOM = BOTTOM + 30;

// === Ts-Kurve (gekrümmte Skala) ===
// Zwei-Anker-Kalibrierung: Die Ts-Position liegt am Schnittpunkt
// zweier Strahlen, jeweils von der M-Skala durch eine Anker-Te-Position.
// Für andere Te-Werte ist die Konstruktion näherungsweise gerade.
// 5 h (untere Grenze des FM-3-3-1 Te-Bereichs) und 240 h (= 10 Tage,
// obere Grenze). Innerhalb dieses Bereichs liegt die Konstruktion
// nahezu exakt; außerhalb steigt der Fehler.
export const TS_ANCHOR_TE_LOW = 5;
export const TS_ANCHOR_TE_HIGH = 240;

// Kompatibilität (bisherige Importnamen)
export const X_PIVOT = X_M;
export const SCALE_D = K_D;
export const SCALE_R1 = K_R1;
export const SCALE_M = K_M;

// === Skalenpositionen ===

/** D-Skala (links). Kleine D oben, große D unten. */
export function yD(d: number): number {
  return TOP + K_D * Math.log10(d / D_MIN);
}

/** R₁-Skala. Kleine R₁ oben, große R₁ unten. */
export function yR1(r1: number): number {
  return TOP + K_R1 * Math.log10(r1 / R1_MIN);
}

/** Bezugslinie M (Multiplikator). Großes M oben, kleines M unten. */
export function yPivot(m: number): number {
  return TOP + K_M * Math.log10(M_MAX / m);
}

/** Alias für yPivot — semantisch korrekter Name. */
export function yM(m: number): number {
  return yPivot(m);
}

// === Te-Diagonale ===

/** Parametrischer Anteil 0..1 von oben (TE_MAX) nach unten (TE_MIN). */
export function teFraction(te: number): number {
  return Math.log10(TE_MAX / te) / LOG_TE_RANGE;
}

export function xTe(te: number): number {
  const f = teFraction(te);
  return X_TE_TOP + f * (X_TE_BOTTOM - X_TE_TOP);
}

export function yTe(te: number): number {
  const f = teFraction(te);
  return Y_TE_TOP + f * (Y_TE_BOTTOM - Y_TE_TOP);
}

// === Ts-Kurve ===

/**
 * yPivot ohne Begrenzung — extrapoliert linear in log-Raum,
 * auch für M-Werte außerhalb [M_MIN, M_MAX]. Wird nur für die
 * Ts-Kurven-Kalibrierung verwendet.
 */
function yPivotExtrapolated(m: number): number {
  return TOP + K_M * Math.log10(M_MAX / m);
}

/** Schnittpunkt zweier durch je zwei Punkte definierter Geraden. */
function lineLineIntersection(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number },
): { x: number; y: number } {
  const dx1 = a2.x - a1.x;
  const dy1 = a2.y - a1.y;
  const dx2 = b2.x - b1.x;
  const dy2 = b2.y - b1.y;
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-9) {
    // parallel — Fallback auf Mittelwert
    return { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
  }
  const t = ((b1.x - a1.x) * dy2 - (b1.y - a1.y) * dx2) / denom;
  return { x: a1.x + t * dx1, y: a1.y + t * dy1 };
}

/**
 * Position auf der Ts-Kurve. Berechnet als Schnittpunkt der Linien
 * (M_low → Te_low) und (M_high → Te_high), wobei M_low/high die aus
 * der Way-Wigner-Formel für (Te_anchor, ts) berechneten M-Werte sind.
 *
 * Damit liegt die Ts-Markierung für die beiden Anker-Te-Werte exakt
 * auf der Geraden M ↔ Te und für andere Te-Werte näherungsweise
 * (analog zum FM-3-3-1 Original).
 */
export function tsPosition(ts: number): { x: number; y: number } {
  const mLow = mFromTeTs(TS_ANCHOR_TE_LOW, ts);
  const mHigh = mFromTeTs(TS_ANCHOR_TE_HIGH, ts);
  const pmLow = { x: X_M, y: yPivotExtrapolated(mLow) };
  const pmHigh = { x: X_M, y: yPivotExtrapolated(mHigh) };
  const pteLow = { x: xTe(TS_ANCHOR_TE_LOW), y: yTe(TS_ANCHOR_TE_LOW) };
  const pteHigh = { x: xTe(TS_ANCHOR_TE_HIGH), y: yTe(TS_ANCHOR_TE_HIGH) };
  return lineLineIntersection(pmLow, pteLow, pmHigh, pteHigh);
}

export function xTs(ts: number): number {
  return tsPosition(ts).x;
}

export function yTs(ts: number): number {
  return tsPosition(ts).y;
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
  return t !== null && t >= TE_MIN && t <= TE_MAX;
}
export function inRangeTe(te: number | null): te is number {
  return te !== null && te >= TE_MIN && te <= TE_MAX;
}
export function inRangeTs(ts: number | null): ts is number {
  return ts !== null && ts >= TS_MIN && ts <= TS_MAX;
}

// Kompatibilität mit bisherigen Tests
export const T_MIN = TE_MIN;
export const T_MAX = TE_MAX;
