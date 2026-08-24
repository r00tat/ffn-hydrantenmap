import { describe, expect, it } from 'vitest';
import {
  chainSegments,
  contourThresholds,
  marchingSquares,
  MAX_THRESHOLDS,
  type HeightGrid,
} from './contour';

describe('contourThresholds', () => {
  it('liefert die Vielfachen der Äquidistanz im Wertebereich', () => {
    expect(contourThresholds(115.3, 119.8, 1)).toEqual([116, 117, 118, 119]);
  });

  it('ist leer, wenn keine Schwelle im Bereich liegt', () => {
    expect(contourThresholds(115.1, 115.9, 1)).toEqual([]);
  });

  it('trägt halbe Äquidistanzen', () => {
    expect(contourThresholds(100, 101.2, 0.5)).toEqual([100.5, 101]);
  });

  it('lässt eine Schwelle genau auf dem Minimum weg', () => {
    // 100 wäre eine entartete Linie durch einen einzelnen Punkt.
    expect(contourThresholds(100, 100.4, 0.5)).toEqual([]);
  });

  it('rundet die Schwellen auf darstellbare Werte', () => {
    // 3 × 0,1 ergibt in Gleitkomma 0,30000000000000004 — und genau so stünde
    // es an der Linie.
    expect(contourThresholds(0.05, 0.35, 0.1)).toEqual([0.1, 0.2, 0.3]);
  });

  it('begrenzt die Zahl der Schwellen', () => {
    expect(contourThresholds(0, 10_000, 0.01)).toHaveLength(MAX_THRESHOLDS);
  });

  it('gibt für eine unbrauchbare Äquidistanz nichts', () => {
    expect(contourThresholds(100, 200, 0)).toEqual([]);
    expect(contourThresholds(100, 200, -1)).toEqual([]);
  });
});

describe('marchingSquares auf einer Ebene', () => {
  // Höhe = Spalte: die Höhenlinie zu 5 muss eine senkrechte Gerade bei col = 5
  // sein.
  const plane: HeightGrid = (_row, col) => col;

  it('ergibt eine senkrechte Gerade an der richtigen Stelle', () => {
    const segments = marchingSquares(plane, 11, 11, 5);
    expect(segments.length).toBeGreaterThan(0);
    for (const segment of segments) {
      expect(segment.from.col).toBeCloseTo(5, 6);
      expect(segment.to.col).toBeCloseTo(5, 6);
    }
  });

  it('ergibt für parallele Schwellen den exakten Abstand', () => {
    const a = marchingSquares(plane, 11, 11, 3)[0];
    const b = marchingSquares(plane, 11, 11, 6)[0];
    expect(b.from.col - a.from.col).toBeCloseTo(3, 6);
  });

  it('verkettet die Gerade zu einer offenen Linie über die ganze Höhe', () => {
    const chains = chainSegments(marchingSquares(plane, 11, 11, 5));
    expect(chains).toHaveLength(1);
    expect(chains[0].closed).toBe(false);
    // Zehn Zellzeilen, also elf Punkte von row 0 bis row 10.
    expect(chains[0].points).toHaveLength(11);
    const rows = chains[0].points.map((point) => point.row);
    expect(Math.min(...rows)).toBe(0);
    expect(Math.max(...rows)).toBe(10);
  });
});

describe('marchingSquares auf einem Kegel', () => {
  // Höhe = 20 - Abstand zur Mitte: geschlossene, konzentrische Ringe.
  const cone: HeightGrid = (row, col) => {
    const dx = col - 20;
    const dy = row - 20;
    return 20 - Math.sqrt(dx * dx + dy * dy);
  };

  it('ergibt einen geschlossenen Ring', () => {
    const chains = chainSegments(marchingSquares(cone, 41, 41, 10));
    expect(chains).toHaveLength(1);
    expect(chains[0].closed).toBe(true);
  });

  it('legt den Ring auf den erwarteten Radius', () => {
    const chain = chainSegments(marchingSquares(cone, 41, 41, 10))[0];
    for (const point of chain.points) {
      const radius = Math.hypot(point.col - 20, point.row - 20);
      // Schwelle 10 ⇒ Radius 10. Die lineare Interpolation auf dem Gitter
      // weicht um weniger als eine halbe Zelle ab.
      expect(radius).toBeGreaterThan(9.5);
      expect(radius).toBeLessThan(10.5);
    }
  });

  it('ergibt für eine höhere Schwelle einen kleineren Ring', () => {
    const außen = chainSegments(marchingSquares(cone, 41, 41, 5))[0];
    const innen = chainSegments(marchingSquares(cone, 41, 41, 15))[0];
    const spanne = (points: { col: number }[]) =>
      Math.max(...points.map((p) => p.col)) -
      Math.min(...points.map((p) => p.col));
    expect(spanne(innen.points)).toBeLessThan(spanne(außen.points));
  });
});

describe('marchingSquares am Sattel', () => {
  // Sattelfläche mit dem Sattelpunkt bei (10, 10) und Wert 0.
  // Die Schwelle 4 ergibt eine Hyperbel mit zwei getrennten Ästen.
  const saddle: HeightGrid = (row, col) =>
    ((col - 10) * (col - 10) - (row - 10) * (row - 10)) / 10;

  it('trennt die beiden Äste der Hyperbel', () => {
    const chains = chainSegments(marchingSquares(saddle, 21, 21, 4));
    expect(chains).toHaveLength(2);
  });

  it('legt die Äste symmetrisch links und rechts des Sattelpunkts', () => {
    const chains = chainSegments(marchingSquares(saddle, 21, 21, 4));
    const mittel = chains.map(
      (chain) =>
        chain.points.reduce((sum, p) => sum + p.col, 0) / chain.points.length
    );
    mittel.sort((a, b) => a - b);
    expect(mittel[0]).toBeLessThan(10);
    expect(mittel[1]).toBeGreaterThan(10);
  });

  it('trennt am Sattelpunkt selbst statt eine Kreuzung zu zeichnen', () => {
    // Schwelle 0 läuft genau durch den Sattelpunkt. Der Mittelwert der Ecken
    // entscheidet, welche der beiden Deutungen gezeichnet wird — gezeichnet
    // werden muss in jedem Fall etwas, und keine Linie darf sich kreuzen.
    const segments = marchingSquares(saddle, 21, 21, 0);
    expect(segments.length).toBeGreaterThan(0);
  });
});

describe('marchingSquares mit nodata', () => {
  it('zieht keine Linie über ein nodata-Loch', () => {
    const withHole: HeightGrid = (row, col) =>
      row >= 4 && row <= 6 && col >= 4 && col <= 6 ? undefined : col;
    const segments = marchingSquares(withHole, 11, 11, 5);
    expect(segments.length).toBeGreaterThan(0);
    // Die Höhenlinie zu 5 läuft bei col = 5 senkrecht durch das Loch. Zellen,
    // die eine Ecke im Loch haben, fallen weg — es bleiben die Zeilen 0..3
    // und 7..10.
    for (const segment of segments) {
      for (const point of [segment.from, segment.to]) {
        expect(point.row <= 3 || point.row >= 7).toBe(true);
      }
    }
  });

  it('gibt für ein vollständig fehlendes Gitter keine Segmente', () => {
    expect(marchingSquares(() => undefined, 5, 5, 1)).toEqual([]);
  });
});

describe('chainSegments', () => {
  it('verkettet Segmente zu einer offenen Linie', () => {
    const chains = chainSegments([
      { from: { col: 0, row: 0 }, to: { col: 1, row: 0 } },
      { from: { col: 1, row: 0 }, to: { col: 2, row: 0 } },
    ]);
    expect(chains).toHaveLength(1);
    expect(chains[0].points).toHaveLength(3);
    expect(chains[0].closed).toBe(false);
  });

  it('erkennt eine geschlossene Linie', () => {
    const chains = chainSegments([
      { from: { col: 0, row: 0 }, to: { col: 1, row: 0 } },
      { from: { col: 1, row: 0 }, to: { col: 1, row: 1 } },
      { from: { col: 1, row: 1 }, to: { col: 0, row: 0 } },
    ]);
    expect(chains).toHaveLength(1);
    expect(chains[0].closed).toBe(true);
    expect(chains[0].points).toHaveLength(3);
  });

  it('trennt unverbundene Linien', () => {
    const chains = chainSegments([
      { from: { col: 0, row: 0 }, to: { col: 1, row: 0 } },
      { from: { col: 5, row: 5 }, to: { col: 6, row: 5 } },
    ]);
    expect(chains).toHaveLength(2);
  });

  it('verkettet auch gegen die Segmentrichtung', () => {
    // Marching Squares gibt keine einheitliche Richtung vor.
    const chains = chainSegments([
      { from: { col: 1, row: 0 }, to: { col: 0, row: 0 } },
      { from: { col: 1, row: 0 }, to: { col: 2, row: 0 } },
    ]);
    expect(chains).toHaveLength(1);
    expect(chains[0].points).toHaveLength(3);
  });

  it('findet beide Enden, wenn das Startsegment mitten in der Linie liegt', () => {
    const chains = chainSegments([
      // Das mittlere Segment steht zuerst.
      { from: { col: 1, row: 0 }, to: { col: 2, row: 0 } },
      { from: { col: 0, row: 0 }, to: { col: 1, row: 0 } },
      { from: { col: 2, row: 0 }, to: { col: 3, row: 0 } },
    ]);
    expect(chains).toHaveLength(1);
    expect(chains[0].points).toHaveLength(4);
    const cols = chains[0].points.map((point) => point.col).sort();
    expect(cols).toEqual([0, 1, 2, 3]);
  });
});
