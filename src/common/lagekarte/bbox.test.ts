import { describe, expect, it } from 'vitest';
import { boundingBoxRadiusM, boundingBoxWithMargin } from './bbox';

describe('boundingBoxWithMargin', () => {
  it('umschließt alle Positionen mit dem Puffer', () => {
    const bbox = boundingBoxWithMargin(
      [
        [47.9, 16.8],
        [47.91, 16.82],
      ],
      300,
    );
    expect(bbox).toBeDefined();
    const [west, south, east, north] = bbox!;
    expect(south).toBeLessThan(47.9);
    expect(north).toBeGreaterThan(47.91);
    expect(west).toBeLessThan(16.8);
    expect(east).toBeGreaterThan(16.82);
  });

  it('puffert in Ost-West-Richtung stärker als in Nord-Süd-Richtung', () => {
    // Auf 48° Breite ist ein Längengrad nur rund zwei Drittel so lang
    const [west, south, east, north] = boundingBoxWithMargin([[48, 16]], 300)!;
    expect(east - west).toBeGreaterThan(north - south);
  });

  it('funktioniert mit einer einzigen Position', () => {
    const bbox = boundingBoxWithMargin([[47.9, 16.8]], 300);
    expect(bbox).toBeDefined();
    const [west, south, east, north] = bbox!;
    expect(north - south).toBeGreaterThan(0);
    expect(east - west).toBeGreaterThan(0);
  });

  it('gibt ohne Positionen undefined zurück', () => {
    expect(boundingBoxWithMargin([], 300)).toBeUndefined();
  });
});

describe('boundingBoxRadiusM', () => {
  it('umschließt die Ecke der BBox', () => {
    // 0.01° Breite ≈ 1112 m, halbe Höhe also ≈ 556 m
    const radius = boundingBoxRadiusM([16.8, 47.9, 16.8, 47.91]);
    expect(radius).toBeGreaterThan(500);
    expect(radius).toBeLessThan(600);
  });

  it('wächst mit der Ausdehnung', () => {
    const klein = boundingBoxRadiusM(boundingBoxWithMargin([[47.9, 16.8]], 300)!);
    const gross = boundingBoxRadiusM(
      boundingBoxWithMargin(
        [
          [47.9, 16.8],
          [47.95, 16.9],
        ],
        300,
      )!,
    );
    expect(gross).toBeGreaterThan(klein * 5);
  });

  it('deckt die halbe Diagonale ab, nicht nur die halbe Kante', () => {
    const quadrat = boundingBoxRadiusM([16.8, 47.9, 16.81, 47.91]);
    const nurHoehe = boundingBoxRadiusM([16.8, 47.9, 16.8, 47.91]);
    expect(quadrat).toBeGreaterThan(nurHoehe);
  });
});
