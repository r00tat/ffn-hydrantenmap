/**
 * Reibungsverlust in Feuerlöschschläuchen.
 *
 * Reine Zahlen, ohne Leaflet und ohne Firestore.
 *
 * Anker ist die belegte Tabelle für B 75 aus „Tabellen für
 * Löschwasserförderung", Ausbildungsunterlage der Freiwilligen Feuerwehr
 * Ebersdorf, HBI Jürgen Stark, Stand 07/2020. Sie wird bewusst **nicht** durch
 * ein Rohrhydraulik-Modell ersetzt:
 *
 * - Das aus ihr zurückgerechnete λ ist nicht monoton (0,0264 · 0,0165 · 0,0146
 *   · 0,0165 · 0,0158 · 0,0183 · 0,0206 bei steigender Reynoldszahl), obwohl λ
 *   mit Re fallen müsste. Sie ist gerundete Praktikerdaten, keine konsistente
 *   Hydraulikkurve — ein daraus „eruiertes" λ(Q) trägt genau die
 *   Tabelleninformation und ist nur schwerer nachprüfbar.
 * - Umgekehrt reproduziert ein konsistentes Modell sie nicht: mit bei
 *   800 l/min kalibriertem λ ergeben sich bei 1600 l/min 4,0 bar (konstantes λ)
 *   bzw. 3,16 bar (λ nach Blasius) statt 5,00. Die Tabelle verläuft dort
 *   überquadratisch, und kein Rohrhydraulik-Modell kann überquadratisch werden.
 *   Sie liegt damit auf der sicheren Seite.
 *
 * Ausführlich samt Gegenprüfung gegen die deutsche Literatur:
 * docs/loeschwasserfoerderung.md
 */

/** Innendurchmesser in mm je Kurzbezeichnung. */
const HOSE_DIAMETERS: Record<string, number> = {
  A: 110,
  B: 75,
  C: 52,
  D: 25,
  F: 152,
};

/**
 * Der Innendurchmesser zu einer Dimensionsangabe der Leitung.
 *
 * Das Feld `dimension` ist Freitext („B", „C 42", „b75"), deshalb wird gelesen
 * statt nachgeschlagen. Eine ausgeschriebene Zahl gewinnt gegen den
 * Standardwert des Buchstabens: „C 42" ist ein anderer Schlauch als „C".
 */
export function hoseInnerDiameterMm(dimension?: string): number | undefined {
  if (!dimension) return undefined;
  const match = /^\s*([A-Fa-f])\s*-?\s*(\d{2,3})?\s*$/.exec(dimension);
  if (!match) return undefined;
  const explicit = match[2] ? Number(match[2]) : undefined;
  return explicit ?? HOSE_DIAMETERS[match[1].toUpperCase()];
}

/** Stützstellen der belegten B-75-Tabelle: l/min → bar je 100 m. */
const B75_TABLE: [flow: number, loss: number][] = [
  [200, 0.1],
  [400, 0.25],
  [600, 0.5],
  [800, 1.0],
  [1000, 1.5],
  [1200, 2.5],
  [1600, 5.0],
];

const B75_DIAMETER = 75;

/**
 * Der B-75-Wert bei beliebiger Menge: an den Stützstellen exakt, dazwischen
 * über Q² interpoliert, außerhalb über Q² extrapoliert.
 *
 * Interpoliert wird in Q² und nicht in Q: Der Verlust wächst quadratisch mit
 * der Menge, eine lineare Interpolation läge in der Mitte jedes Intervalls zu
 * hoch.
 */
function b75LossPer100m(flow: number): number {
  if (flow <= 0) return 0;

  const first = B75_TABLE[0];
  if (flow <= first[0]) {
    return first[1] * (flow / first[0]) ** 2;
  }

  const last = B75_TABLE[B75_TABLE.length - 1];
  if (flow >= last[0]) {
    return last[1] * (flow / last[0]) ** 2;
  }

  const upperIndex = B75_TABLE.findIndex(([tableFlow]) => tableFlow >= flow);
  const [lowerFlow, lowerLoss] = B75_TABLE[upperIndex - 1];
  const [upperFlow, upperLoss] = B75_TABLE[upperIndex];
  const ratio =
    (flow ** 2 - lowerFlow ** 2) / (upperFlow ** 2 - lowerFlow ** 2);
  return lowerLoss + (upperLoss - lowerLoss) * ratio;
}

/**
 * Ob der Wert direkt aus der belegten Tabelle stammt oder aus ihr abgeleitet
 * ist. Der Dialog weist das aus, damit eine Zahl aus der Formel nicht für einen
 * Tabellenwert genommen wird.
 */
export const isTabulatedDimension = (dimension?: string): boolean =>
  hoseInnerDiameterMm(dimension) === B75_DIAMETER;

/**
 * Reibungsverlust in bar je 100 m, oder `undefined`, wenn die Dimension keinen
 * bekannten Durchmesser hat — dann wird nicht geraten, sondern nicht gerechnet.
 *
 * Andere Dimensionen als B 75 folgen aus Darcy-Weisbach: mit v = Q/A und
 * A ∝ d² ist Δp ∝ λ·Q²/d⁵, bei gleichem λ also das (75/d)⁵-fache des
 * B-75-Werts. Gegen die veröffentlichten C-52-Werte geprüft (7–11 %
 * Abweichung); bei C 42 wird sie größer (bis 38 %), weil kleine Durchmesser
 * relativ rauer sind, als das konstante λ annimmt.
 */
export function frictionLossPer100m(
  flow: number,
  dimension?: string
): number | undefined {
  const diameter = hoseInnerDiameterMm(dimension);
  if (!diameter) return undefined;
  return b75LossPer100m(flow) * (B75_DIAMETER / diameter) ** 5;
}
