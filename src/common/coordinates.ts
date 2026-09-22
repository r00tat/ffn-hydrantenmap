/**
 * Koordinaten lesen und schreiben.
 *
 * Gebraucht wird das, weil Koordinaten von außen kommen — von Polizei, LSZ
 * oder aus einer Meldung — und dort in jeder üblichen Schreibweise stehen. Die
 * App rechnet intern nur in Dezimalgrad; dieses Modul ist die Schleuse
 * dazwischen und kennt drei Schreibweisen:
 *
 * | Kürzel | Beispiel                       |
 * | ------ | ------------------------------ |
 * | `dec`  | `47.94829, 16.84822`           |
 * | `dms`  | `47°56'53.8"N 16°50'53.6"E`    |
 * | `ddm`  | `N 47°56.897' E 16°50.893'`    |
 *
 * Gelesen wird großzügig — jede der drei Schreibweisen, mit oder ohne
 * Gradzeichen, mit vorangestellter oder nachgestellter Himmelsrichtung, mit
 * Punkt oder deutschem Komma. Geschrieben wird eng: je Schreibweise genau eine
 * Form.
 */

export interface CoordinatePair {
  lat: number;
  lng: number;
}

export type CoordinateAxis = 'lat' | 'lng';

/** Der zulässige Betrag je Achse. */
const MAX: Record<CoordinateAxis, number> = { lat: 90, lng: 180 };

/**
 * Ein Wert mit der Himmelsrichtung, sofern eine dabeistand.
 *
 * Die Richtung ist das einzige, was die Achse verrät. Fehlt sie, bleibt es bei
 * der Reihenfolge „Breite zuerst".
 */
interface Component {
  value: number;
  axis?: CoordinateAxis;
}

/**
 * Sonderzeichen auf die ASCII-Form bringen.
 *
 * Was aus einer E-Mail oder einem PDF kopiert wird, trägt typografische
 * Zeichen: `′`/`’` statt `'`, `″`/`”` statt `"`, ein Ordinalzeichen statt des
 * Gradzeichens. Ohne diesen Schritt scheitert jedes eingefügte DMS-Paar.
 */
function normalize(input: string): string {
  return input
    .replace(/[º˚∘]/g, '°')
    .replace(/[′’´`‵]/g, "'")
    .replace(/[″”“‶]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Deutsches Dezimalkomma in beiden Werten, getrennt durch ein Leerzeichen. */
const GERMAN_DECIMAL_PAIR = /^(-?\d+,\d+) (-?\d+,\d+)$/;

/**
 * Die Eingabe in ihre zwei Hälften zerlegen.
 *
 * Drei Wege, in dieser Reihenfolge — der jeweils frühere ist der eindeutigere:
 * ein ausdrückliches Trennzeichen, die Himmelsrichtungen, das Leerzeichen.
 */
function splitHalves(input: string): [string, string] | undefined {
  const bySeparator = input.split(/ ?[;,/] ?/).filter((part) => part !== '');
  if (bySeparator.length === 2) {
    return [bySeparator[0], bySeparator[1]];
  }

  // Zwei Himmelsrichtungen trennen das Paar zuverlässiger als jedes
  // Leerzeichen — `47 56 53.8 N 16 50 53.6 E` hat sieben davon.
  const letters = [...input.matchAll(/[NSEWnsew]/g)].map((m) => m.index);
  if (letters.length === 2) {
    // Vorangestellt (`N 47… E 16…`) wird vor der zweiten Richtung getrennt,
    // nachgestellt (`47…N 16…E`) hinter der ersten.
    const cut = /^[NSEWnsew]/.test(input) ? letters[1] : letters[0] + 1;
    return [input.slice(0, cut).trim(), input.slice(cut).trim()];
  }

  const tokens = input.split(' ');
  // Zwei Werte, oder zweimal Grad/Minuten(/Sekunden) ohne jedes Zeichen.
  if (tokens.length === 2) return [tokens[0], tokens[1]];
  if (tokens.length === 4) {
    return [tokens.slice(0, 2).join(' '), tokens.slice(2).join(' ')];
  }
  if (tokens.length === 6) {
    return [tokens.slice(0, 3).join(' '), tokens.slice(3).join(' ')];
  }
  return undefined;
}

const COMPONENT =
  /^([NSEW])? ?(-?\d+(?:\.\d+)?) ?°? ?(?:(\d+(?:\.\d+)?) ?'? ?(?:(\d+(?:\.\d+)?) ?"?)?)? ?([NSEW])?$/i;

function axisOf(letter?: string): CoordinateAxis | undefined {
  const upper = letter?.toUpperCase();
  if (upper === 'N' || upper === 'S') return 'lat';
  if (upper === 'E' || upper === 'W') return 'lng';
  return undefined;
}

/** Eine einzelne Gradangabe lesen — Dezimalgrad, DDM oder DMS. */
function parseComponent(raw: string): Component | undefined {
  const match = COMPONENT.exec(raw.trim());
  if (!match) return undefined;
  const [, before, degrees, minutes, seconds, after] = match;
  // Eine Richtung, nicht zwei: `N 47 S` ist keine Angabe, sondern ein Tippfehler.
  if (before && after) return undefined;

  const deg = Number.parseFloat(degrees);
  if (!Number.isFinite(deg)) return undefined;
  // Minuten gibt es nur zu ganzen Graden. Ohne diese Schranke läse
  // `47.94829 16.84822` als ein einziger Wert mit 16,8 Minuten.
  if (minutes !== undefined && !Number.isInteger(deg)) return undefined;

  const min = minutes === undefined ? 0 : Number.parseFloat(minutes);
  const sec = seconds === undefined ? 0 : Number.parseFloat(seconds);
  if (min >= 60 || sec >= 60) return undefined;

  const letter = before || after;
  const magnitude = Math.abs(deg) + min / 60 + sec / 3600;
  const negative = deg < 0 || /[SW]/i.test(letter || '');

  return { value: negative ? -magnitude : magnitude, axis: axisOf(letter) };
}

function inRange(value: number, axis: CoordinateAxis): boolean {
  return Math.abs(value) <= MAX[axis];
}

/**
 * Ein Koordinatenpaar lesen.
 *
 * @returns die Position in Dezimalgrad, oder `undefined`, wenn die Eingabe
 *   keine gültige ist — Halbfertiges beim Tippen ist der Normalfall und kein
 *   Fehler.
 */
export function parseCoordinatePair(
  input: string
): CoordinatePair | undefined {
  if (!input?.trim()) return undefined;
  let normalized = normalize(input);

  const german = GERMAN_DECIMAL_PAIR.exec(normalized);
  if (german) {
    normalized = `${german[1].replace(',', '.')} ${german[2].replace(',', '.')}`;
  }

  const halves = splitHalves(normalized);
  if (!halves) return undefined;

  const first = parseComponent(halves[0]);
  const second = parseComponent(halves[1]);
  if (!first || !second) return undefined;
  // Zwei Breiten sind kein Paar.
  if (first.axis && second.axis && first.axis === second.axis) return undefined;

  const latFirst = first.axis !== 'lng' && second.axis !== 'lat';
  const lat = latFirst ? first.value : second.value;
  const lng = latFirst ? second.value : first.value;

  if (!inRange(lat, 'lat') || !inRange(lng, 'lng')) return undefined;
  return { lat, lng };
}

/**
 * Einen einzelnen Wert lesen — für die beiden Dezimalfelder, in die sich aber
 * genauso gut eine DMS-Angabe einfügen lässt.
 */
export function parseCoordinateValue(
  input: string,
  axis: CoordinateAxis
): number | undefined {
  if (!input?.trim()) return undefined;
  const component = parseComponent(normalize(input));
  if (!component) return undefined;
  // Steht eine Richtung dabei, muss sie zur Achse passen.
  if (component.axis && component.axis !== axis) return undefined;
  return inRange(component.value, axis) ? component.value : undefined;
}

function hemisphere(value: number, axis: CoordinateAxis): string {
  if (axis === 'lat') return value < 0 ? 'S' : 'N';
  return value < 0 ? 'W' : 'E';
}

/**
 * Grad, Minuten und Sekunden mit Übertrag.
 *
 * Der Übertrag ist kein Zierrat: Ohne ihn stünde bei 47,99999° `47°59'60.0"`
 * auf der Karte — eine Angabe, die es nicht gibt.
 */
function dmsParts(value: number): { deg: number; min: number; sec: number } {
  const abs = Math.abs(value);
  let deg = Math.floor(abs);
  let min = Math.floor((abs - deg) * 60);
  let sec = Math.round(((abs - deg) * 60 - min) * 60 * 10) / 10;
  if (sec >= 60) {
    sec -= 60;
    min += 1;
  }
  if (min >= 60) {
    min -= 60;
    deg += 1;
  }
  return { deg, min, sec };
}

function ddmParts(value: number): { deg: number; min: number } {
  const abs = Math.abs(value);
  let deg = Math.floor(abs);
  let min = Math.round((abs - deg) * 60 * 1000) / 1000;
  if (min >= 60) {
    min -= 60;
    deg += 1;
  }
  return { deg, min };
}

/** `47.94829, 16.84822` — fünf Nachkommastellen sind gut ein Meter. */
export function formatDecimal(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/** `47°56'53.8"N 16°50'53.6"E` */
export function formatDms(lat: number, lng: number): string {
  const one = (value: number, axis: CoordinateAxis) => {
    const { deg, min, sec } = dmsParts(value);
    return `${deg}°${min}'${sec.toFixed(1)}"${hemisphere(value, axis)}`;
  };
  return `${one(lat, 'lat')} ${one(lng, 'lng')}`;
}

/** `N 47°56.897' E 16°50.893'` */
export function formatDdm(lat: number, lng: number): string {
  const one = (value: number, axis: CoordinateAxis) => {
    const { deg, min } = ddmParts(value);
    return `${hemisphere(value, axis)} ${deg}°${min.toFixed(3)}'`;
  };
  return `${one(lat, 'lat')} ${one(lng, 'lng')}`;
}
