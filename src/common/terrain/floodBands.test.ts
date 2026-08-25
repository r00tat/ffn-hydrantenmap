import { describe, expect, it } from 'vitest';
import {
  BAND_DEPTHS_M,
  floodBands,
  MAX_BAND_POINTS,
  MIN_RING_AREA_M2,
  pointInRings,
  SIMPLIFY_STEPS_CELLS,
} from './floodBands';
import { floodFill } from './floodFill';
import { harnessOrigin, terrainHarness } from './terrainTestHarness';

/** Versätze zur Südwestecke des Gitters, wie in `floodFill.test.ts`. */
const offsets = (blockPx: number) => {
  const { e0, n0 } = harnessOrigin(blockPx);
  return {
    c: (col: number) => col - e0,
    k: (row: number) => -(row + n0),
  };
};

describe('floodBands', () => {
  it('liefert je Tiefenstufe geschlossene Ringe', async () => {
    // Mulde 12 × 12 m auf 98 m, Rand 105 m. Bei h = 100 sind das 2 m Tiefe,
    // also werden die Stufen 0, 0,1, 0,3, 0,7 und 1,5 alle erreicht. Die
    // Mulde liegt mit vier Zellen Abstand zum Gitterrand, damit die Ringe
    // nicht am Rand des Modells hängen.
    const { c, k } = offsets(8);
    const h = terrainHarness({
      blockPx: 8,
      grid: 3,
      height: (col, row) =>
        c(col) >= 4 && c(col) < 16 && k(row) >= 4 && k(row) < 16 ? 98 : 105,
    });
    const seed = h.latLngOfCell(h.e0 + 5, -(h.n0 + 5));
    const fill = await floodFill(h.store, seed, 100, 'detail');
    expect(fill.cells).toBe(144);
    const bands = await floodBands(h.store, fill, 100);

    expect(bands.baender.map((b) => b.tiefeM)).toEqual(BAND_DEPTHS_M);
    for (const band of bands.baender) {
      expect(band.ringe.length).toBeGreaterThan(0);
      for (const ring of band.ringe) {
        expect(ring.length).toBeGreaterThanOrEqual(4);
        expect(ring[0]).toEqual(ring[ring.length - 1]);
      }
    }
    expect(bands.punkte).toBeLessThanOrEqual(MAX_BAND_POINTS);
  });

  it('eine trockene Insel ergibt einen zweiten Ring im Band', async () => {
    // Mulde 24 × 24 m mit einer Insel von 12 × 12 m: die Insel liegt über der
    // Mindestfläche und muss als eigener Ring erscheinen.
    const { c, k } = offsets(16);
    const h = terrainHarness({
      blockPx: 16,
      grid: 2,
      height: (col, row) => {
        const inMulde =
          c(col) >= 4 && c(col) < 28 && k(row) >= 4 && k(row) < 28;
        const inInsel =
          c(col) >= 12 && c(col) < 24 && k(row) >= 12 && k(row) < 24;
        if (!inMulde) return 105;
        return inInsel ? 105 : 98;
      },
    });
    const seed = h.latLngOfCell(h.e0 + 5, -(h.n0 + 5));
    const fill = await floodFill(h.store, seed, 100, 'detail');
    const bands = await floodBands(h.store, fill, 100);
    const band0 = bands.baender.find((b) => b.tiefeM === 0);
    expect(band0?.ringe.length).toBe(2);
  });

  it('verwirft Ringe unter der Mindestfläche und zählt sie', async () => {
    // Insel von 2 × 2 m — rund 6 m² Ringfläche und damit unter 100 m².
    const { c, k } = offsets(16);
    const h = terrainHarness({
      blockPx: 16,
      grid: 2,
      height: (col, row) => {
        const inMulde =
          c(col) >= 4 && c(col) < 28 && k(row) >= 4 && k(row) < 28;
        const inInsel =
          c(col) >= 16 && c(col) < 18 && k(row) >= 16 && k(row) < 18;
        if (!inMulde) return 105;
        return inInsel ? 105 : 98;
      },
    });
    const seed = h.latLngOfCell(h.e0 + 5, -(h.n0 + 5));
    const fill = await floodFill(h.store, seed, 100, 'detail');
    const bands = await floodBands(h.store, fill, 100);
    expect(MIN_RING_AREA_M2).toBe(100);
    expect(bands.inselnVerworfen).toBeGreaterThan(0);
    expect(bands.baender.find((b) => b.tiefeM === 0)?.ringe.length).toBe(1);
  });

  it('erhöht die Toleranz, bis das Punktbudget passt', async () => {
    // Kegelförmige Mulde: die Bänder sind Kreise, und an Kreisen ist die
    // Ausdünnung messbar. Wasserstand 100 m ⇒ Rand bei r = 25 m.
    const { c, k } = offsets(32);
    const h = terrainHarness({
      blockPx: 32,
      grid: 2,
      height: (col, row) =>
        98 + 0.08 * Math.hypot(c(col) - 32, k(row) - 32),
    });
    const seed = h.latLngOfCell(h.e0 + 30, -(h.n0 + 30));
    const fill = await floodFill(h.store, seed, 100, 'detail', {
      budgetBlocks: 4,
    });

    // `maxPoints: 0` ist von keiner Toleranz zu erfüllen: die Schleife läuft
    // alle Stufen durch und endet bei der gröbsten.
    const grob = await floodBands(h.store, fill, 100, { maxPoints: 0 });
    const fein = await floodBands(h.store, fill, 100);

    expect(fein.toleranzM).toBe(SIMPLIFY_STEPS_CELLS[0]);
    expect(grob.toleranzM).toBe(
      SIMPLIFY_STEPS_CELLS[SIMPLIFY_STEPS_CELLS.length - 1]
    );
    expect(grob.toleranzM).toBeGreaterThan(0.5);
    expect(grob.punkte).toBeLessThan(fein.punkte);
  });

  it('pointInRings folgt der Even-odd-Regel', () => {
    // Quadrat mit Loch: der Punkt in der Mitte liegt in beiden Ringen und
    // zählt damit außen — dieselbe Regel, mit der Leaflet füllt.
    const outer: [number, number][] = [
      [47.94, 16.84],
      [47.95, 16.84],
      [47.95, 16.85],
      [47.94, 16.85],
      [47.94, 16.84],
    ];
    const hole: [number, number][] = [
      [47.943, 16.843],
      [47.947, 16.843],
      [47.947, 16.847],
      [47.943, 16.847],
      [47.943, 16.843],
    ];
    expect(pointInRings([47.9415, 16.8415], [outer, hole])).toBe(true);
    expect(pointInRings([47.945, 16.845], [outer, hole])).toBe(false);
    expect(pointInRings([47.9, 16.8], [outer, hole])).toBe(false);
  });
});
