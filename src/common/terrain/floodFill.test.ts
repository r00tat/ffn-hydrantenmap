import { describe, expect, it, vi } from 'vitest';
import { FLOOD_BUDGET_BLOCKS, FloodAborted, floodFill } from './floodFill';
import { blockId } from './grid';
import { harnessOrigin, terrainHarness } from './terrainTestHarness';

/**
 * Die Höhenmuster stehen in **globalen** Zellen, und die liegen in EPSG:3035
 * bei Millionen. Gerechnet wird deshalb in Versätzen zur Südwestecke des
 * Gitters: `c` nach Osten, `k` nach Norden, beide ab 0.
 */
const offsets = (blockPx: number) => {
  const { e0, n0 } = harnessOrigin(blockPx);
  return {
    e0,
    n0,
    c: (col: number) => col - e0,
    k: (row: number) => -(row + n0),
  };
};

describe('floodFill', () => {
  it('füllt eine Wanne über Blockgrenzen hinweg', async () => {
    // 4 × 4 Blöcke à 8 m: eine Mulde auf 99 m über 20 × 20 m, sonst 105 m.
    const { c, k } = offsets(8);
    const h = terrainHarness({
      blockPx: 8,
      grid: 4,
      height: (col, row) =>
        c(col) < 20 && c(col) >= 0 && k(row) < 20 && k(row) >= 0 ? 99 : 105,
    });
    const seed = h.latLngOfCell(h.e0 + 5, -(h.n0 + 5));
    const result = await floodFill(h.store, seed, 100, 'detail');
    expect(result.reason).toBeUndefined();
    expect(result.cells).toBe(400);
    expect(result.areaM2).toBe(result.cells);
    expect(result.maxDepthM).toBeCloseTo(1, 6);
    // Mehr als ein Block beteiligt: die Mulde ist 20 m breit, ein Block 8 m.
    expect(result.blocks.size).toBeGreaterThan(1);
  });

  it('ein ein Meter breiter Damm sperrt (4er-Nachbarschaft)', async () => {
    // Ein diagonaler Wall auf 105 m quer durch die Ebene auf 99 m. Mit
    // 8er-Nachbarschaft würde das Wasser diagonal durchsickern; mit 4er
    // bleibt genau das Dreieck südwestlich des Walls.
    const { c, k } = offsets(16);
    const h = terrainHarness({
      blockPx: 16,
      grid: 2,
      height: (col, row) => (c(col) + k(row) === 16 ? 105 : 99),
    });
    const seed = h.latLngOfCell(h.e0 + 1, -(h.n0 + 1));
    const result = await floodFill(h.store, seed, 100, 'detail', {
      budgetBlocks: 4,
    });
    // Zellen mit c + k ≤ 15: 1 + 2 + … + 16 = 136.
    expect(result.cells).toBe(136);
    expect(result.cells).toBeLessThan(16 * 16 * 4);
  });

  it('eine unverbundene Senke bleibt trocken', async () => {
    const { c, k } = offsets(8);
    const h = terrainHarness({
      blockPx: 8,
      grid: 2,
      height: (col, row) => {
        // verbundene Mulde und getrennte Senke, drei Zeilen auseinander
        if (k(row) === 3 && c(col) >= 0 && c(col) < 4) return 99;
        if (k(row) === 6 && c(col) >= 0 && c(col) < 4) return 99;
        return 105;
      },
    });
    const seed = h.latLngOfCell(h.e0 + 1, -(h.n0 + 3));
    const result = await floodFill(h.store, seed, 100, 'detail');
    expect(result.cells).toBe(4);
  });

  it('nodata sperrt und wird nicht als 0 m gelesen', async () => {
    const { c } = offsets(8);
    const h = terrainHarness({
      blockPx: 8,
      grid: 1,
      height: (col) => (c(col) === 2 ? undefined : 99),
    });
    // Nicht auf die Gitterecke setzen: der Hin- und Rückweg über WGS84 kann
    // sie um Gleitkommarauschen nach außen schieben, und dann liegt der
    // Saatpunkt im nicht vorhandenen Nachbarblock.
    const seed = h.latLngOfCell(h.e0 + 1, -(h.n0 + 1));
    const result = await floodFill(h.store, seed, 100, 'detail');
    // Nur die zwei Spalten westlich der nodata-Spalte.
    expect(result.cells).toBe(2 * 8);
  });

  it('unterscheidet Rand des Modells von fehlender Kachel', async () => {
    const h = terrainHarness({
      blockPx: 8,
      grid: 2,
      height: () => 99,
      // Der östliche Nachbar existiert laut Index nicht.
      exists: (col) => col === 0,
      failing: [],
    });
    const seed = h.latLngOfCell(h.e0 + 1, -(h.n0 + 1));
    const result = await floodFill(h.store, seed, 100, 'detail');
    expect(result.edgeBlocks).toBeGreaterThan(0);
    expect(result.missingBlocks).toBe(0);
  });

  it('meldet eine Kachel, die es gibt, aber nicht lädt', async () => {
    // Der Startblock muss laden — fehlschlagen soll der östliche Nachbar,
    // und der wird über seinen echten Namen benannt.
    const { e0, n0 } = harnessOrigin(8);
    const h = terrainHarness({
      blockPx: 8,
      grid: 2,
      height: () => 99,
      failing: [blockId({ e: e0 + 8, n: n0, sizeM: 8 })],
    });
    const seed = h.latLngOfCell(h.e0 + 1, -(h.n0 + 1));
    const result = await floodFill(h.store, seed, 100, 'detail');
    expect(result.missingBlocks).toBeGreaterThan(0);
  });

  it('bricht am Budget ab und sagt es', async () => {
    const h = terrainHarness({ blockPx: 8, grid: 4, height: () => 99 });
    const seed = h.latLngOfCell(h.e0 + 1, -(h.n0 + 1));
    const result = await floodFill(h.store, seed, 100, 'detail', {
      budgetBlocks: 2,
    });
    expect(result.truncated).toBe('budget');
    expect(result.blocks.size).toBeLessThanOrEqual(2);
  });

  it('begrenzt die Ausbreitung auf den Umkreis und sagt es', async () => {
    // Ebene auf 99 m über 4 × 4 Blöcke à 8 m: ohne Umkreis liefe die Füllung
    // über das ganze Gitter. Mit 5 m Umkreis bleibt eine Scheibe um den
    // Saatpunkt.
    const h = terrainHarness({ blockPx: 8, grid: 4, height: () => 99 });
    // Nicht auf eine Blockkante (Vielfaches von 8): der Hin- und Rückweg über
    // WGS84 schiebt sie sonst in den Nachbarblock.
    const seed = h.latLngOfCell(h.e0 + 17, -(h.n0 + 17));
    const ohne = await floodFill(h.store, seed, 100, 'detail');
    const mit = await floodFill(h.store, seed, 100, 'detail', {
      maxRadiusM: 5,
    });

    expect(mit.cells).toBeLessThan(ohne.cells);
    expect(mit.truncated).toBe('radius');
    // Eine Kreisscheibe mit r = 5 m auf einem 1-m-Raster: π·25 ≈ 79 Zellen,
    // gezählt werden die Zellmitten innerhalb des Umkreises.
    expect(mit.cells).toBeGreaterThan(60);
    expect(mit.cells).toBeLessThan(100);
    // Keine Zelle liegt weiter als der Umkreis vom Saatpunkt entfernt.
    expect(mit.longestAxisM).toBeLessThanOrEqual(2 * 5 + 1);
  });

  it('lädt keine Kacheln, die ganz außerhalb des Umkreises liegen', async () => {
    const h = terrainHarness({ blockPx: 8, grid: 4, height: () => 99 });
    const seed = h.latLngOfCell(h.e0 + 4, -(h.n0 + 4));
    const mit = await floodFill(h.store, seed, 100, 'detail', {
      maxRadiusM: 3,
    });
    // 3 m um eine Position im ersten Block: kein anderer Block wird berührt.
    expect(mit.blocks.size).toBe(1);
  });

  it('nennt den Grund, wenn der Saatpunkt über dem Wasserstand liegt', async () => {
    const h = terrainHarness({ blockPx: 8, grid: 1, height: () => 105 });
    const seed = h.latLngOfCell(h.e0 + 1, -(h.n0 + 1));
    const result = await floodFill(h.store, seed, 100, 'detail');
    expect(result.reason).toBe('seedAboveLevel');
    expect(result.cells).toBe(0);
  });

  it('nennt den Grund, wenn am Saatpunkt keine Daten liegen', async () => {
    const h = terrainHarness({ blockPx: 8, grid: 1, height: () => undefined });
    const seed = h.latLngOfCell(h.e0 + 1, -(h.n0 + 1));
    const result = await floodFill(h.store, seed, 100, 'detail');
    expect(result.reason).toBe('seedNoData');
  });

  it('meldet Fortschritt und lässt sich abbrechen', async () => {
    const h = terrainHarness({ blockPx: 8, grid: 4, height: () => 99 });
    const seed = h.latLngOfCell(h.e0 + 1, -(h.n0 + 1));
    const onProgress = vi.fn();
    await expect(
      floodFill(h.store, seed, 100, 'detail', {
        onProgress,
        abort: () => onProgress.mock.calls.length >= 2,
      })
    ).rejects.toBeInstanceOf(FloodAborted);
    expect(onProgress).toHaveBeenCalled();
  });

  it('hat für beide Stufen ein Budget', () => {
    expect(FLOOD_BUDGET_BLOCKS.detail).toBe(120);
    expect(FLOOD_BUDGET_BLOCKS.overview).toBe(25);
  });
});
