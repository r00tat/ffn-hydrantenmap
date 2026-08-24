/**
 * Höhenlinien nach Marching Squares.
 *
 * Je Zelle werden die vier Ecken gegen die Schwelle geprüft; die 16 Fälle
 * ergeben 0, 1 oder 2 Segmente. Die Schnittpunkte werden linear zwischen den
 * Ecken interpoliert, sodass die Linie durch die tatsächliche Höhe läuft und
 * nicht auf die Zellkanten rastert.
 *
 * Zellen mit `nodata` in einer Ecke werden übersprungen. Eine Linie durch den
 * Rand der Datenabdeckung wäre eine erfundene Geländeform — und im Gelände ist
 * eine erfundene Höhenlinie von einer echten nicht zu unterscheiden.
 *
 * Die Sattelfälle 5 und 10 sind nicht eindeutig; entschieden wird über den
 * Mittelwert der vier Ecken. Das ist die übliche Auflösung und für die
 * Kartendarstellung ausreichend.
 */

export interface ContourPoint {
  /** Zellkoordinaten in Pixeln, Ursprung oben links. */
  col: number;
  row: number;
}

export interface ContourSegment {
  from: ContourPoint;
  to: ContourPoint;
}

export type HeightGrid = (row: number, col: number) => number | undefined;

/**
 * Obergrenze der Schwellen je Abfrage.
 *
 * Eine Äquidistanz von 1 m über 400 m Höhenunterschied ist noch darstellbar;
 * ein Tippfehler wie 0,01 m über dasselbe Gelände wären 40.000 Linien und ein
 * eingefrorener Browser.
 */
export const MAX_THRESHOLDS = 400;

/**
 * Die Schwellen einer Äquidistanz im Wertebereich eines Gitters.
 *
 * Streng größer als `min` und kleiner oder gleich `max`. Eine Schwelle genau
 * auf dem Minimum ergibt entweder gar keine oder eine entartete Linie durch
 * einen einzelnen Punkt — beides ist keine Höhenlinie.
 */
export function contourThresholds(
  min: number,
  max: number,
  equidistanceM: number
): number[] {
  if (!(equidistanceM > 0) || !Number.isFinite(min) || !Number.isFinite(max)) {
    return [];
  }
  const thresholds: number[] = [];
  let step = Math.floor(min / equidistanceM) + 1;
  for (;;) {
    // Auf sechs Stellen runden: sonst wird aus 3 × 0,1 die Schwelle
    // 0,30000000000000004, und die Beschriftung zeigt sie so an.
    const value = Number((step * equidistanceM).toFixed(6));
    if (value > max) break;
    if (value > min) thresholds.push(value);
    if (thresholds.length >= MAX_THRESHOLDS) break;
    step += 1;
  }
  return thresholds;
}

/** Segmente einer Schwelle auf einem Gitter. */
export function marchingSquares(
  heights: HeightGrid,
  cols: number,
  rows: number,
  threshold: number
): ContourSegment[] {
  const segments: ContourSegment[] = [];

  for (let row = 0; row + 1 < rows; row += 1) {
    for (let col = 0; col + 1 < cols; col += 1) {
      const topLeft = heights(row, col);
      const topRight = heights(row, col + 1);
      const bottomRight = heights(row + 1, col + 1);
      const bottomLeft = heights(row + 1, col);
      if (
        topLeft === undefined ||
        topRight === undefined ||
        bottomRight === undefined ||
        bottomLeft === undefined
      ) {
        continue;
      }

      const index =
        (topLeft >= threshold ? 8 : 0) +
        (topRight >= threshold ? 4 : 0) +
        (bottomRight >= threshold ? 2 : 0) +
        (bottomLeft >= threshold ? 1 : 0);
      if (index === 0 || index === 15) continue;

      /** Anteil, bei dem die Schwelle zwischen zwei Ecken liegt. */
      const fraction = (from: number, to: number): number =>
        to === from ? 0.5 : (threshold - from) / (to - from);

      const top = (): ContourPoint => ({
        col: col + fraction(topLeft, topRight),
        row,
      });
      const right = (): ContourPoint => ({
        col: col + 1,
        row: row + fraction(topRight, bottomRight),
      });
      const bottom = (): ContourPoint => ({
        col: col + fraction(bottomLeft, bottomRight),
        row: row + 1,
      });
      const left = (): ContourPoint => ({
        col,
        row: row + fraction(topLeft, bottomLeft),
      });

      /**
       * Entartete Segmente fallen weg.
       *
       * Liegt ein Gitterpunkt **exakt** auf der Schwelle, interpolieren beide
       * anliegenden Kanten auf genau diesen Punkt, und das Segment hat die
       * Länge null. Auf einem Kegel trifft das jeden pythagoräischen Punkt —
       * bei Schwelle 10 also (0,±10), (±6,±8), (±8,±6). Behalten würde man
       * acht Ein-Punkt-„Linien" neben dem eigentlichen Ring, und die
       * Verkettung zählte sie als eigene Höhenlinien.
       */
      const push = (from: ContourPoint, to: ContourPoint): void => {
        if (from.col === to.col && from.row === to.row) return;
        segments.push({ from, to });
      };

      switch (index) {
        case 1:
        case 14:
          push(left(), bottom());
          break;
        case 2:
        case 13:
          push(bottom(), right());
          break;
        case 3:
        case 12:
          push(left(), right());
          break;
        case 4:
        case 11:
          push(top(), right());
          break;
        case 6:
        case 9:
          push(top(), bottom());
          break;
        case 7:
        case 8:
          push(left(), top());
          break;
        case 5: {
          // Sattel: liegt die Mitte über der Schwelle, sind die beiden hohen
          // Ecken verbunden und die tiefen getrennt — und umgekehrt.
          const middle =
            (topLeft + topRight + bottomRight + bottomLeft) / 4 >= threshold;
          if (middle) {
            push(left(), top());
            push(bottom(), right());
          } else {
            push(left(), bottom());
            push(top(), right());
          }
          break;
        }
        case 10: {
          const middle =
            (topLeft + topRight + bottomRight + bottomLeft) / 4 >= threshold;
          if (middle) {
            push(top(), right());
            push(left(), bottom());
          } else {
            push(left(), top());
            push(bottom(), right());
          }
          break;
        }
        default:
          break;
      }
    }
  }

  return segments;
}

export interface ContourChain {
  points: ContourPoint[];
  closed: boolean;
}

/** Ein Tausendstel Pixel: enger als jede Interpolation, weiter als das Rauschen. */
const KEY_SCALE = 1000;

const pointKey = (point: ContourPoint): string =>
  `${Math.round(point.col * KEY_SCALE)},${Math.round(point.row * KEY_SCALE)}`;

/**
 * Segmente zu durchgehenden Polylinien verketten.
 *
 * Marching Squares liefert Segmente in beliebiger Reihenfolge; ohne Verkettung
 * wären es tausende Zwei-Punkt-Linien, was Rendern und Beschriftung unbrauchbar
 * macht. Verkettet wird über eine Hashtabelle der Endpunkte mit einer Toleranz
 * von einem Tausendstel Pixel.
 *
 * Die Richtung der Segmente wird nicht vorausgesetzt: angehängt wird an dem
 * Ende, das passt.
 */
export function chainSegments(segments: ContourSegment[]): ContourChain[] {
  const byKey = new Map<string, number[]>();
  segments.forEach((segment, index) => {
    for (const key of [pointKey(segment.from), pointKey(segment.to)]) {
      const list = byKey.get(key);
      if (list) list.push(index);
      else byKey.set(key, [index]);
    }
  });

  const used = new Array<boolean>(segments.length).fill(false);

  /** Das andere Ende eines Segments, gemessen an einem bekannten Endpunkt. */
  const otherEnd = (index: number, key: string): ContourPoint => {
    const segment = segments[index];
    return pointKey(segment.from) === key ? segment.to : segment.from;
  };

  /** Anhängen, solange ein unbenutztes Segment am letzten Punkt hängt. */
  const extend = (points: ContourPoint[]): boolean => {
    for (;;) {
      const key = pointKey(points[points.length - 1]);
      const candidates = byKey.get(key);
      if (!candidates) return false;
      const next = candidates.find((index) => !used[index]);
      if (next === undefined) return false;

      used[next] = true;
      const point = otherEnd(next, key);
      if (pointKey(point) === pointKey(points[0])) return true;
      points.push(point);
    }
  };

  const chains: ContourChain[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    if (used[index]) continue;
    used[index] = true;
    const points = [segments[index].from, segments[index].to];

    const closed = extend(points);
    if (!closed) {
      // Am anderen Ende weitersuchen: das Startsegment lag irgendwo mitten
      // in der Linie.
      points.reverse();
      extend(points);
    }
    chains.push({ points, closed });
  }
  return chains;
}
