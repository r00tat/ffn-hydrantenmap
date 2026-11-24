import { describe, expect, it } from 'vitest';
import {
  layoutPages,
  mapPointBetweenLayouts,
  pageAtScroll,
  pagesToRender,
  zoomForMark,
} from './pageLayout';

// A4 hoch (595 × 842) und A3 quer (1191 × 842).
const sizes = [
  { width: 595, height: 842 },
  { width: 1191, height: 842 },
  { width: 595, height: 842 },
];

describe('layoutPages', () => {
  it('passt jede Seite auf die Breite ein und stapelt sie mit Abstand', () => {
    const layout = layoutPages(sizes, 400, 1, 8);
    expect(layout.pages.map((p) => p.width)).toEqual([400, 400, 400]);
    expect(layout.pages[0].height).toBeCloseTo(566.05, 1);
    expect(layout.pages[1].height).toBeCloseTo(282.79, 1);
    expect(layout.pages[0].top).toBe(0);
    expect(layout.pages[1].top).toBeCloseTo(566.05 + 8, 1);
    expect(layout.pages[2].top).toBeCloseTo(566.05 + 8 + 282.79 + 8, 1);
    expect(layout.totalHeight).toBeCloseTo(layout.pages[2].top + layout.pages[2].height, 5);
  });

  it('skaliert mit dem Zoom', () => {
    const layout = layoutPages(sizes, 400, 2, 8);
    expect(layout.pages[0].width).toBe(800);
    expect(layout.pages[0].height).toBeCloseTo(1132.1, 1);
  });

  it('liefert ohne Breite nichts', () => {
    expect(layoutPages(sizes, 0, 1, 8).pages).toEqual([]);
  });
});

describe('pageAtScroll', () => {
  const layout = layoutPages(sizes, 400, 1, 8);

  it('nimmt die Seite in der Mitte des sichtbaren Bereichs', () => {
    expect(pageAtScroll(layout, 0, 300)).toBe(1);
    expect(pageAtScroll(layout, 500, 300)).toBe(2);
    expect(pageAtScroll(layout, layout.totalHeight - 300, 300)).toBe(3);
  });

  it('bleibt innerhalb der Seiten', () => {
    expect(pageAtScroll(layout, -100, 300)).toBe(1);
    expect(pageAtScroll(layout, 99_999, 300)).toBe(3);
    expect(pageAtScroll(layoutPages([], 400, 1, 8), 0, 300)).toBe(1);
  });
});

describe('pagesToRender', () => {
  const layout = layoutPages(sizes, 400, 1, 8);

  it('rendert die sichtbaren Seiten und eine Bildschirmhöhe davor und danach', () => {
    expect(pagesToRender(layout, 0, 200)).toEqual([1]);
    expect(pagesToRender(layout, 0, 400)).toEqual([1, 2]);
    expect(pagesToRender(layout, 600, 200)).toEqual([1, 2, 3]);
  });

  it('lässt weit entfernte Seiten aus', () => {
    const many = layoutPages(Array(20).fill({ width: 595, height: 842 }), 400, 1, 8);
    const at = many.pages[10].top;
    expect(pagesToRender(many, at, 500)).toEqual([10, 11, 12]);
  });
});

describe('zoomForMark', () => {
  it('vergrößert, bis die Markierung lesbar hoch ist', () => {
    // 10 px hoch bei eingepasster Seite → 3,6fach für 36 px.
    expect(zoomForMark([0.1, 0.1, 0.2, 0.11], 1000)).toBeCloseTo(3.6);
  });

  it('bleibt mindestens eingepasst und höchstens beim Höchstwert', () => {
    expect(zoomForMark([0, 0, 0.5, 0.5], 1000)).toBe(1);
    expect(zoomForMark([0, 0, 0.01, 0.001], 1000)).toBe(4);
  });
});

describe('mapPointBetweenLayouts', () => {
  const before = layoutPages(sizes, 400, 1, 8);
  const after = layoutPages(sizes, 400, 2, 8);

  it('hält einen Punkt auf derselben Stelle der Seite', () => {
    // Mitte der zweiten Seite.
    const p = before.pages[1];
    const mapped = mapPointBetweenLayouts(before, after, 200, p.top + p.height / 2);
    expect(mapped.x).toBeCloseTo(400);
    expect(mapped.y).toBeCloseTo(after.pages[1].top + after.pages[1].height / 2);
  });

  it('wächst der Abstand zwischen den Seiten nicht mit', () => {
    const mapped = mapPointBetweenLayouts(before, after, 0, before.pages[1].top);
    expect(mapped.y).toBeCloseTo(after.pages[1].top);
  });

  it('ordnet einen Punkt im Abstand der Seite davor zu', () => {
    const p = before.pages[0];
    const mapped = mapPointBetweenLayouts(before, after, 0, p.top + p.height + 4);
    expect(mapped.y).toBeCloseTo(after.pages[0].height + 4);
  });

  it('skaliert ohne Seiten einfach mit', () => {
    const empty = { pages: [], totalHeight: 0 };
    expect(mapPointBetweenLayouts(empty, empty, 10, 20)).toEqual({ x: 10, y: 20 });
  });
});
