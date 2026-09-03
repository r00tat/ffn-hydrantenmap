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

/**
 * Innendurchmesser in mm je Kurzbezeichnung.
 *
 * Exportiert, weil die Knopfreihe im Panel dieselbe Liste braucht — zwei
 * gepflegte Aufzählungen derselben Schläuche liefen auseinander.
 */
export const HOSE_DIAMETERS: Record<string, number> = {
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

/**
 * Buchstabe und Durchmesser einer Dimensionsangabe — der Rückweg zu
 * `hoseInnerDiameterMm`, damit das Panel zwei Bedienelemente füllen kann.
 *
 * Unlesbares gibt ein leeres Ergebnis und **keinen** geratenen Buchstaben: Im
 * Panel bleibt dann kein Knopf gewählt, und die Warnung steht weiter.
 */
export function splitDimension(dimension?: string): {
  letter?: string;
  diameterMm?: number;
} {
  if (!dimension) return {};
  const match = /^\s*([A-Fa-f])\s*-?\s*(\d{2,3})?\s*$/.exec(dimension);
  if (!match) return {};
  const letter = match[1].toUpperCase();
  const diameterMm = match[2] ? Number(match[2]) : HOSE_DIAMETERS[letter];
  return diameterMm ? { letter, diameterMm } : { letter };
}

/**
 * Die Schreibweise, die am Element landet: der Buchstabe allein, solange die mm
 * dem Standardwert entsprechen, sonst Buchstabe plus Zahl.
 *
 * Gespeichert wird weiter **ein** Freitextfeld, obwohl das Panel zwei
 * Bedienelemente zeigt. Ein zweites Feld für den Durchmesser könnte dem ersten
 * widersprechen, und `info()`, `popupFn()` und die Schlauchanzahl lesen
 * `dimension` mit — „62 B-Längen" soll sich weiter richtig lesen.
 */
export function canonicalDimension(
  letter: string,
  diameterMm?: number
): string {
  const key = letter.toUpperCase();
  if (!diameterMm || HOSE_DIAMETERS[key] === diameterMm) return key;
  return `${key} ${diameterMm}`;
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
 * Wahlweise reale Rohrhydraulik statt der Tabelle.
 *
 * Die Tabelle bleibt die **Vorbelegung** — sie ist die Unterlage, mit der hier
 * ausgebildet wird, und der Abschnitt „Warum die Tabelle und kein
 * Rechenmodell" in docs/loeschwasserfoerderung.md begründet weiterhin, warum
 * sie nicht ersetzt *werden muss*. Wer sie dennoch gegen ein Modell tauschen
 * will, kann das hier; die Anzeige nennt dann immer, welches Modell gerechnet
 * hat.
 */
export type FrictionModel = 'table' | 'colebrook';

/** Absolute Rauheit eines gummierten Druckschlauchs. */
export const DEFAULT_ROUGHNESS_MM = 0.03;

/** Örtlicher Verlust einer Storz-Kupplung bei der Bezugsmenge. */
export const DEFAULT_COUPLING_BAR = 0.05;

/**
 * Bezugsmenge des Kupplungsverlusts.
 *
 * Eine **feste** Zahl und ausdrücklich nicht `pumpenNennstrom`: Sonst
 * veränderte ein geänderter Pumpennennwert stillschweigend den
 * Kupplungsverlust, und niemand käme auf die Ursache.
 */
export const COUPLING_REFERENCE_FLOW = 1000;

/** Übliche Länge eines Druckschlauchs. */
export const DEFAULT_HOSE_LENGTH_M = 20;

/**
 * Stoffwerte des Wassers bei **10 °C**.
 *
 * Die Temperatur ist nicht beliebig gewählt: Die Reynoldszahlen der
 * Gegenprüfung in docs/loeschwasserfoerderung.md (43k · 86k · 130k · 173k ·
 * 216k · 259k · 346k) sind mit genau diesem ν gerechnet. Ein anderer Wert
 * entwertete die dort niedergelegte Prüfung, ohne am Ergebnis mehr als wenige
 * Prozent zu ändern — deshalb auch keine Eingabe für die Wassertemperatur.
 */
const KINEMATIC_VISCOSITY = 1.31e-6;
const WATER_DENSITY = 1000;

/** Ab hier gilt die turbulente Formel; darunter λ = 64/Re. */
const LAMINAR_LIMIT_RE = 2300;

export interface FrictionOptions {
  /** Vorbelegung `'table'` — der Tabellenweg bleibt der Normalfall. */
  model?: FrictionModel;
  roughnessMm?: number;
  /** bar je Kupplung bei `COUPLING_REFERENCE_FLOW`. Nur im Modell wirksam. */
  couplingBarAtNominal?: number;
  hoseLengthM?: number;
}

export interface FrictionBreakdown {
  /** Reibungsverlust des Schlauchs in bar je 100 m. */
  rohr: number;
  /** Örtliche Verluste der Kupplungen in bar je 100 m; bei `'table'` immer 0. */
  kupplungen: number;
  total: number;
  /**
   * Woher der Wert stammt: aus der belegten Tabelle, über die d⁵-Skalierung
   * daraus abgeleitet, oder gerechnet. Drei Herkünfte, deshalb ein Begriff und
   * kein Boolean.
   */
  source: 'table' | 'derived' | 'model';
}

/**
 * Darcy-Weisbach mit λ aus **Swamee-Jain**, der expliziten Näherung der
 * impliziten Colebrook-White-Gleichung (unter 1 % Abweichung). Explizit, damit
 * ohne Iteration gerechnet wird — der Wert hängt an einem Regler und wird bei
 * jedem Render neu gebraucht.
 */
function colebrookLossPer100m(
  flow: number,
  diameterMm: number,
  roughnessMm: number
): number {
  if (flow <= 0) return 0;

  const d = diameterMm / 1000;
  const k = roughnessMm / 1000;
  const area = (Math.PI * d * d) / 4;
  const v = flow / 60000 / area;
  const re = (v * d) / KINEMATIC_VISCOSITY;

  const lambda =
    re < LAMINAR_LIMIT_RE
      ? 64 / re
      : 0.25 / Math.log10(k / (3.7 * d) + 5.74 / re ** 0.9) ** 2;

  return (lambda * (100 / d) * (WATER_DENSITY / 2) * v * v) / 1e5;
}

/**
 * Die Kupplungen als gleichmäßige Rate je 100 m.
 *
 * Eingegeben wird in bar bei der Bezugsmenge und mit (Q/Q₀)² mitgezogen: Ein
 * *fester* bar-Wert wäre bei anderer Fördermenge falsch, weil der örtliche
 * Verlust mit v² wächst. Ein Widerstandsbeiwert ζ wäre die lehrbuchgemäße
 * Eingabe, ist aber keine Zahl, zu der im Einsatz jemand ein Gefühl hat.
 *
 * Exakt wären *n − 1* Stöße über die ganze Leitung. Die Hydraulik rechnet
 * jedoch mit einer gleichmäßigen bar-je-Meter-Rate; der Unterschied ist eine
 * Kupplung auf der Gesamtstrecke. Parallele Leitungen bekommen **keinen**
 * Faktor: Die Menge je Leitung ist schon geteilt, und jede Leitung hat ihre
 * eigenen Schläuche im selben Abstand.
 */
function couplingLossPer100m(
  flow: number,
  barAtNominal: number,
  hoseLengthM: number
): number {
  if (flow <= 0 || barAtNominal <= 0 || hoseLengthM <= 0) return 0;
  const couplingsPer100m = 100 / hoseLengthM;
  return (
    barAtNominal * (flow / COUPLING_REFERENCE_FLOW) ** 2 * couplingsPer100m
  );
}

/**
 * Reibungsverlust je 100 m, aufgeschlüsselt in Schlauch und Kupplungen.
 *
 * **Bei `model: 'table'` bleiben die Kupplungen 0**, auch wenn ein Wert
 * übergeben wird: Die AT-Tabelle ist an echten Schlauchleitungen gemessene
 * Praktikerdaten, die Kupplungsverluste stecken dort schon drin. Ein Aufschlag
 * zählte sie doppelt. Im Colebrook-Weg ist es umgekehrt — der rechnet ein
 * glattes Rohr, und dort fehlen sie.
 */
export function frictionBreakdownPer100m(
  flow: number,
  dimension?: string,
  options?: FrictionOptions
): FrictionBreakdown | undefined {
  const diameter = hoseInnerDiameterMm(dimension);
  if (!diameter) return undefined;

  if (options?.model === 'colebrook') {
    const rohr = colebrookLossPer100m(
      flow,
      diameter,
      options.roughnessMm ?? DEFAULT_ROUGHNESS_MM
    );
    const kupplungen = couplingLossPer100m(
      flow,
      options.couplingBarAtNominal ?? DEFAULT_COUPLING_BAR,
      options.hoseLengthM ?? DEFAULT_HOSE_LENGTH_M
    );
    return { rohr, kupplungen, total: rohr + kupplungen, source: 'model' };
  }

  const rohr = b75LossPer100m(flow) * (B75_DIAMETER / diameter) ** 5;
  return {
    rohr,
    kupplungen: 0,
    total: rohr,
    source: diameter === B75_DIAMETER ? 'table' : 'derived',
  };
}

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
  dimension?: string,
  options?: FrictionOptions
): number | undefined {
  return frictionBreakdownPer100m(flow, dimension, options)?.total;
}
