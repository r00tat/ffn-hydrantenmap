'use client';

/**
 * Die Regeln des Höhenlinien-Layers, ohne React und Leaflet.
 *
 * Herausgelöst, damit die Äquidistanz-Staffel, die Farbrampe und die Setzung
 * der Beschriftungen für sich prüfbar sind: sie entscheiden darüber, ob die
 * Karte lesbar bleibt, und das ist keine Frage, die ein Rendertest gut
 * beantwortet.
 */

export const HOEHENLINIEN_LAYER_NAME = 'Höhenlinien';

/** Unter diesem Schlüssel steht die manuelle Wahl im `localStorage`. */
export const EQUIDISTANCE_STORAGE_KEY = 'hydrantenmap.hoehenlinien.aequidistanz';

export const EQUIDISTANCE_CHOICES = [
  'auto',
  '0.5',
  '1',
  '2',
  '5',
  '10',
] as const;
export type EquidistanceChoice = (typeof EQUIDISTANCE_CHOICES)[number];

/**
 * Toleranz beim Vergleich von Höhen.
 *
 * `contourThresholds` rechnet die Schwellen aus Vielfachen der Äquidistanz und
 * rundet auf sechs Stellen; aus 3 × 0,1 wird dabei 0,3, aber nicht jede
 * Schwelle trifft ihren runden Wert exakt. Ein Vergleich auf Gleichheit würde
 * einzelne Zähllinien verlieren.
 */
const EPSILON = 1e-6;

/**
 * Äquidistanz nach Zoomstufe.
 *
 * Die Staffel folgt dem, was auf dem Bildschirm noch zu unterscheiden ist:
 * 0,5 m auf Zoom 18 sind im Flachland des Seewinkels bereits enge Linien,
 * dieselbe Äquidistanz auf Zoom 14 wäre eine schwarze Fläche.
 */
export function equidistanceForZoom(zoom: number): number {
  if (zoom >= 18) return 0.5;
  if (zoom >= 17) return 1;
  if (zoom >= 16) return 2;
  if (zoom >= 15) return 5;
  return 10;
}

/** Die tatsächlich verwendete Äquidistanz aus Wahl und Zoomstufe. */
export function resolveEquidistance(
  choice: EquidistanceChoice,
  zoom: number
): number {
  return choice === 'auto' ? equidistanceForZoom(zoom) : Number(choice);
}

/** Die gespeicherte Wahl, oder `'auto'` — auch bei unbrauchbarem Inhalt. */
export function readEquidistanceChoice(): EquidistanceChoice {
  if (typeof window === 'undefined') return 'auto';
  const stored = window.localStorage.getItem(EQUIDISTANCE_STORAGE_KEY);
  return EQUIDISTANCE_CHOICES.includes(stored as EquidistanceChoice)
    ? (stored as EquidistanceChoice)
    : 'auto';
}

/**
 * Höhenabstand der Zähllinien.
 *
 * Zähllinien sind die beschrifteten, kräftig gezeichneten Linien, zwischen
 * denen die Zwischenlinien liegen. Sie hängen an der Äquidistanz und **nicht**
 * am ganzen Meter: bei 10 m Äquidistanz ist jede Höhe ein ganzer Meter, jede
 * Linie wäre eine Zähllinie und bekäme eine Beschriftung.
 *
 * Gewählt ist jeweils das nächste runde Vielfache, das etwa jede vierte bis
 * fünfte Linie trifft und sich noch als glatte Zahl beschriften lässt.
 */
export function indexInterval(equidistanceM: number): number {
  if (equidistanceM >= 10) return 50;
  if (equidistanceM >= 5) return 25;
  if (equidistanceM >= 2) return 10;
  if (equidistanceM >= 1) return 5;
  return 2;
}

/** Ob eine Linie beschriftet und hervorgehoben wird. */
export function isIndexContour(
  heightM: number,
  equidistanceM: number
): boolean {
  const steps = heightM / indexInterval(equidistanceM);
  return Math.abs(steps - Math.round(steps)) < EPSILON;
}

/**
 * Strichstärke einer Höhenlinie.
 *
 * Zähllinien stärker als Zwischenlinien: bei 0,5 m Äquidistanz stünde sonst
 * ein Bündel gleich starker Linien da, in dem keine Höhe mehr ablesbar ist.
 * Dasselbe Mittel wie auf jeder topografischen Karte.
 */
export function contourWeight(
  heightM: number,
  equidistanceM: number
): number {
  return isIndexContour(heightM, equidistanceM) ? 2 : 1.1;
}

/**
 * Breite der Kontur unter einer Zähllinie.
 *
 * Nur unter den Zähllinien, nicht unter allen: ein Ausschnitt im flachen
 * Gelände hat bei 0,5 m Äquidistanz über tausend Linienstücke, und jede
 * doppelt gezeichnet lässt das Verschieben der Karte ruckeln.
 */
export const contourCasingWeight = (heightM: number, equidistanceM: number) =>
  contourWeight(heightM, equidistanceM) + 2.4;

/**
 * Farbe der Kontur: dunkel unter hellen Linien.
 *
 * Ohne sie steht eine helle Linie auf einem hellen Luftbild — Schnee, Beton,
 * Stoppelfeld — ohne Kontrast da. Die Kontur ist das Mittel, das jede Karte
 * über Bildmaterial verwendet; sie bringt für die Lesbarkeit mehr als jede
 * Farbwahl.
 */
export const contourCasingColor = (dark: boolean): string =>
  dark ? 'rgba(0, 0, 0, 0.65)' : 'rgba(0, 0, 0, 0.5)';

/**
 * Die Farbrampe der Höhenlinien: kühl für tief, warm für hoch.
 *
 * Nicht die klassische Höhenschichtfarbe (Grün über Ocker zu Braun): die ist
 * auf eine absolute Höhenspanne gerechnet, und im Ausrückebereich sind das
 * 5,7 m auf den Quadratkilometer im Seewinkel gegen 776 m Spanne des ganzen
 * Modells. Alle Linien bekämen praktisch denselben Ton.
 *
 * Stattdessen wird die Rampe auf den **sichtbaren Ausschnitt** gedehnt, und
 * sie läuft über den Farbton statt über die Helligkeit: die Linien bleiben
 * damit auf hellem Kartenhintergrund wie auf dem Luftbild gleich gut zu sehen.
 * Ein Verlauf hell→dunkel würde am einen Ende jeweils verschwinden.
 *
 * Die Töne sind **kräftig und hell** gewählt, nicht gedeckt: eine Höhenlinie
 * ist gut einen Pixel breit und liegt über Luftbild oder Karte, nicht auf
 * weißem Papier. Gedeckte Farben, die auf einem Bildschirmentwurf noch
 * angenehm wirken, verschwinden dort. Den Kontrast nach unten liefert die
 * Kontur (`contourCasingColor`), nicht die Linienfarbe.
 *
 * Was die Farbe bedeutet, steht nur in der Legende — deshalb ist sie
 * Pflichtteil dieser Darstellung und nicht Beiwerk.
 */
type Stop = readonly [number, number, number];

const RAMP_LIGHT: readonly Stop[] = [
  [0, 169, 201], // Cyan — der tiefste Punkt im Ausschnitt
  [23, 184, 74], // Grün
  [224, 180, 0], // Bernstein
  [242, 118, 12], // Orange
  [232, 52, 42], // Rot — der höchste Punkt
];

/**
 * Für das dunkle Theme aufgehellt.
 *
 * Dieselben Farbtöne in derselben Reihenfolge: die Legende zeigt in beiden
 * Themes dieselbe Aussage, nur mit anderem Kontrast.
 */
const RAMP_DARK: readonly Stop[] = [
  [64, 216, 240],
  [92, 224, 122],
  [245, 215, 74],
  [255, 160, 77],
  [255, 107, 94],
];

const hex = (value: number): string =>
  Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, '0');

/** Farbe an der Stelle `t` (0…1) der Rampe. */
function rampColor(stops: readonly Stop[], t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const position = clamped * (stops.length - 1);
  const lower = Math.floor(position);
  const upper = Math.min(stops.length - 1, lower + 1);
  const fraction = position - lower;
  const from = stops[lower];
  const to = stops[upper];
  return `#${hex(from[0] + (to[0] - from[0]) * fraction)}${hex(
    from[1] + (to[1] - from[1]) * fraction
  )}${hex(from[2] + (to[2] - from[2]) * fraction)}`;
}

/**
 * Farbe einer Höhenlinie, bezogen auf die Spanne des Ausschnitts.
 *
 * `minM === maxM` kommt vor — ein Ausschnitt über einer einzigen Höhenstufe.
 * Dann steht die Linie in der Mitte der Rampe, statt dass eine Division durch
 * Null als `NaN` in die Farbe läuft.
 */
export function contourColor(
  heightM: number,
  minM: number,
  maxM: number,
  dark: boolean
): string {
  const span = maxM - minM;
  const t = span > 0 ? (heightM - minM) / span : 0.5;
  return rampColor(dark ? RAMP_DARK : RAMP_LIGHT, t);
}

/** Dieselbe Rampe als CSS-Verlauf für die Legende. */
export function contourRampCss(dark: boolean): string {
  const stops = dark ? RAMP_DARK : RAMP_LIGHT;
  const parts = stops.map(
    (_, index) =>
      `${rampColor(stops, index / (stops.length - 1))} ${(
        (index / (stops.length - 1)) *
        100
      ).toFixed(0)}%`
  );
  return `linear-gradient(to right, ${parts.join(', ')})`;
}

/** Relative Helligkeit nach WCAG, für den Kontrast der Beschriftung. */
function luminance([r, g, b]: readonly [number, number, number]): number {
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  );
}

const parseHex = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/**
 * Farbe der Beschriftung an einer Linie.
 *
 * Der Farbton der Linie, aber auf eine Helligkeit gebracht, bei der Text
 * lesbar bleibt: die Linienfarben sind hell gewählt, damit sie über dem
 * Luftbild stehen — als Text auf hellem Grund wäre dasselbe Bernstein nicht
 * mehr zu entziffern. Ein Strich verzeiht schwachen Kontrast, eine Ziffer
 * nicht.
 */
export function contourLabelColor(
  heightM: number,
  minM: number,
  maxM: number,
  dark: boolean
): string {
  const rgb = parseHex(contourColor(heightM, minM, maxM, dark));
  // Auf hellem Grund abdunkeln, auf dunklem aufhellen — in Schritten, damit
  // der Farbton erhalten bleibt und nicht in Grau kippt.
  let adjusted: [number, number, number] = [...rgb];
  for (let step = 0; step < 12; step += 1) {
    const value = luminance(adjusted);
    if (dark ? value >= 0.5 : value <= 0.22) break;
    adjusted = dark
      ? [
          adjusted[0] + (255 - adjusted[0]) * 0.18,
          adjusted[1] + (255 - adjusted[1]) * 0.18,
          adjusted[2] + (255 - adjusted[2]) * 0.18,
        ]
      : [adjusted[0] * 0.82, adjusted[1] * 0.82, adjusted[2] * 0.82];
  }
  return `#${hex(adjusted[0])}${hex(adjusted[1])}${hex(adjusted[2])}`;
}

/**
 * Die Höhe, wie sie an der Linie steht.
 *
 * Ohne Einheit: auf der Karte steht sie zwischen den Linien, und „m" an jeder
 * Beschriftung ist Rauschen. Die Einheit sagt die Legende.
 */
export function contourLabelText(heightM: number): string {
  const rounded = Math.round(heightM * 10) / 10;
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(1).replace('.', ',');
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface LabelAnchor extends ScreenPoint {
  /** Drehung des Textes in Grad, nie über ±90 — sonst steht er kopf. */
  angleDeg: number;
}

/**
 * Wo an einer Linie ihre Höhe steht.
 *
 * Gerechnet wird in Bildschirmpixeln, nicht in Koordinaten: ob zwei
 * Beschriftungen aneinanderstoßen, hängt am Zoom, und in Grad ausgedrückt
 * wäre der Abstand am Bildschirm eine andere Zahl je Zoomstufe.
 *
 * Kurze Linien bleiben unbeschriftet: eine Beschriftung ist rund 30 px breit,
 * auf einem Stummel stünde sie über beide Enden hinaus und zeigte auf nichts.
 * Lange Linien bekommen mehrere, sonst müsste man einer Höhenlinie quer über
 * den Bildschirm folgen, um ihren Wert zu finden.
 */
export function labelAnchors(
  points: readonly ScreenPoint[],
  spacingPx: number,
  minLengthPx: number
): LabelAnchor[] {
  if (points.length < 2) return [];

  const lengths: number[] = [0];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y
    );
    lengths.push(total);
  }
  if (total < minLengthPx) return [];

  const count = Math.max(1, Math.floor(total / spacingPx));
  const step = total / count;

  const anchors: LabelAnchor[] = [];
  for (let i = 0; i < count; i += 1) {
    const target = step * (i + 0.5);
    let segment = 1;
    while (segment < lengths.length - 1 && lengths[segment] < target) {
      segment += 1;
    }
    const from = points[segment - 1];
    const to = points[segment];
    const segmentLength = lengths[segment] - lengths[segment - 1];
    const fraction =
      segmentLength > 0 ? (target - lengths[segment - 1]) / segmentLength : 0;

    const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
    anchors.push({
      x: from.x + (to.x - from.x) * fraction,
      y: from.y + (to.y - from.y) * fraction,
      // Nach oben oder unten gekippt ist gleichwertig, kopfstehend nicht.
      angleDeg: angle > 90 ? angle - 180 : angle < -90 ? angle + 180 : angle,
    });
  }
  return anchors;
}

/**
 * Beschriftungen ausdünnen, die einander überdecken würden.
 *
 * Ein Ausschnitt mit 0,5 m Äquidistanz hat dutzende Zähllinien, und die
 * Beschriftungen fallen dort zusammen, wo die Linien eng liegen — also genau
 * im steilen Gelände, wo sie am meisten gebraucht werden. Je Rasterzelle
 * bleibt die erste stehen; die Reihenfolge der Eingabe entscheidet damit, was
 * Vorrang hat.
 */
export function thinLabels<T extends ScreenPoint>(
  labels: readonly T[],
  cellPx: number
): T[] {
  const taken = new Set<string>();
  const kept: T[] = [];
  for (const label of labels) {
    const cell = `${Math.round(label.x / cellPx)}:${Math.round(
      label.y / cellPx
    )}`;
    if (taken.has(cell)) continue;
    taken.add(cell);
    kept.push(label);
  }
  return kept;
}
