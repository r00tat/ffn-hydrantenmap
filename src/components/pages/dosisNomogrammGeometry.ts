/**
 * Geometrie/Skalierung des Dosis-Nomogramms (FM 3-3-1).
 *
 * Konstruktion in zwei Schritten mit GERADEN Linien:
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
 *   Die Beziehung M(Te, Ts) ist in den Variablen Te und Ts nicht separabel,
 *   daher kann kein 3-Skalen-Nomogramm mit geraden Linien sie exakt darstellen.
 *
 *   Die Te-Achse ist in u = Te^(-0,2) linear parametrisiert (die "natürliche"
 *   Variable der Way-Wigner-Formel). Die Ts-Position wird durch eine
 *   Least-Squares-Anpassung über 128 logarithmisch verteilte Te-Anker
 *   bestimmt: Für jeden Anker definiert die Linie M(Te, Ts) → Te eine Gerade;
 *   die Ts-Position minimiert die Summe der quadrierten Abstände zu allen
 *   diesen Geraden.
 *
 *   Maximaler Fehler im typischen Bereich (Te=0,5..720 h, Ts=0,1..24 h):
 *   ≈ 8 px; durchschnittlich ≈ 2 px. Für die Mittelfeld-Werte (Te ≈ 5..240 h)
 *   liegt die Ts-Position fast exakt auf der Te-M-Linie (< 3 px).
 */

export const VB_W = 820;
export const VB_H = 560;
export const TOP = 90;
export const BOTTOM = 490;
export const CHART_H = BOTTOM - TOP;

// === Wertebereiche (D, R₁, M abgestimmt für exakte Parallel-Skala) ===
// Bedingung: R1_MIN·M_MAX = D_MIN und R1_MAX·M_MIN = D_MAX.
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
const LOG_R1_RANGE = Math.log10(R1_MAX / R1_MIN); // 6
const LOG_M_RANGE = Math.log10(M_MAX / M_MIN); // 3

export const K_D = CHART_H / LOG_D_RANGE; // H/3
export const K_R1 = CHART_H / LOG_R1_RANGE; // H/6
export const K_M = CHART_H / LOG_M_RANGE; // H/3

// === X-Positionen der vertikalen Skalen ===
export const X_D = 90;
export const X_M = 380; // Bezugslinie zentral platziert

// α: Position der R₁-Skala zwischen D (α=0) und M (α=1)
// Bedingung Parallel-Skala: α = K_D / (K_D + K_M)
export const ALPHA_R1 = K_D / (K_D + K_M); // = 0.5 mit K_D = K_M = H/3
export const X_R1 = X_D + ALPHA_R1 * (X_M - X_D);

// === Diagonale Te-Skala ===
// In u = Te^(-0,2) linear parametrisiert; die Endpunkte sind so platziert,
// dass die LSQ-Anpassung der Ts-Kurve den geringsten Fehler liefert
// (Grid-Suche über die Endpunkte ergab x ≈ 560..680, y deckungsgleich mit
// der Chart-Höhe).
export const X_TE_TOP = 560;
export const Y_TE_TOP = TOP;
export const X_TE_BOTTOM = 680;
export const Y_TE_BOTTOM = BOTTOM;

// === Ts-Kurve: LSQ-Kalibrierung ===
// Anzahl der logarithmisch verteilten Te-Anker für die LSQ-Anpassung.
// Mehr Anker liefern eine glattere Mittelung, ändern aber das Ergebnis
// kaum (Konvergenz bereits ab ~32 Ankern). 128 bietet hohe Genauigkeit bei
// vernachlässigbarem Berechnungsaufwand (~13 Ts-Werte × 128 ≈ 1700 Op).
const TS_CALIBRATION_ANCHOR_COUNT = 128;

const TS_CALIBRATION_TE_ANCHORS: readonly number[] = (() => {
  const a: number[] = [];
  const lmin = Math.log(TE_MIN);
  const lmax = Math.log(TE_MAX);
  for (let i = 0; i < TS_CALIBRATION_ANCHOR_COUNT; i++) {
    a.push(
      Math.exp(lmin + ((lmax - lmin) * i) / (TS_CALIBRATION_ANCHOR_COUNT - 1)),
    );
  }
  return a;
})();

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

/**
 * yPivot ohne Begrenzung — extrapoliert linear im log-Raum auch für
 * M-Werte außerhalb [M_MIN, M_MAX]. Wird für die Ts-Kurven-Kalibrierung
 * und für die Anzeige der blauen Linie bei sehr kleinen M-Werten
 * (hohe Te) verwendet.
 */
export function yPivotExtrapolated(m: number): number {
  return TOP + K_M * Math.log10(M_MAX / m);
}

// === Te-Diagonale ===

/**
 * Parametrischer Anteil 0..1 von oben (TE_MAX) nach unten (TE_MIN).
 *
 * Linear in u = Te^(-0,2): Mit u_min = TE_MAX^(-0,2) und u_max = TE_MIN^(-0,2)
 * gilt f(Te) = (Te^(-0,2) − u_min) / (u_max − u_min). Diese Parametrisierung
 * macht die Te-Achse in der natürlichen Variable der Way-Wigner-Formel
 * gleichmäßig — gleiche u-Differenzen entsprechen gleichen geometrischen
 * Abständen — wodurch die Konstruktion auch zwischen den Kalibrierankern
 * sehr genau bleibt.
 */
const U_MIN_TE = Math.pow(TE_MAX, -0.2);
const U_MAX_TE = Math.pow(TE_MIN, -0.2);

export function teFraction(te: number): number {
  return (Math.pow(te, -0.2) - U_MIN_TE) / (U_MAX_TE - U_MIN_TE);
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
 * Position auf der Ts-Kurve via Least-Squares-Anpassung.
 *
 * Für gegebenes Ts wird über alle Kalibrieranker Te_i die Linie
 * (M(Te_i, Ts), Te_i) gebildet. Der zurückgegebene Punkt minimiert die
 * Summe der quadrierten orthogonalen Abstände zu all diesen Linien.
 *
 * Lineares 2×2-System (Normal-Gleichungen für die LSQ-Lösung):
 *   Jede Linie wird als a·x + b·y + c = 0 (mit a²+b²=1) geschrieben.
 *   Der Abstand vom Punkt (px, py) zur Linie ist d = a·px + b·py + c.
 *   Σ d² wird minimiert durch ∂/∂px = ∂/∂py = 0:
 *     [Σa²  Σab] [px]   [-Σac]
 *     [Σab  Σb²] [py] = [-Σbc]
 */
export function tsPosition(ts: number): { x: number; y: number } {
  let sA2 = 0;
  let sAB = 0;
  let sB2 = 0;
  let sAC = 0;
  let sBC = 0;

  for (const te of TS_CALIBRATION_TE_ANCHORS) {
    const m = mFromTeTs(te, ts);
    const p1x = X_M;
    const p1y = yPivotExtrapolated(m);
    const p2x = xTe(te);
    const p2y = yTe(te);
    const dx = p2x - p1x;
    const dy = p2y - p1y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-9) continue;
    const a = -dy / len;
    const b = dx / len;
    const c = -(a * p1x + b * p1y);
    sA2 += a * a;
    sAB += a * b;
    sB2 += b * b;
    sAC += a * c;
    sBC += b * c;
  }

  const det = sA2 * sB2 - sAB * sAB;
  if (Math.abs(det) < 1e-12) {
    return { x: X_M + 100, y: TOP };
  }
  return {
    x: (-sAC * sB2 + sBC * sAB) / det,
    y: (sAC * sAB - sBC * sA2) / det,
  };
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
