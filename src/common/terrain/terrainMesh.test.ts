import { describe, expect, it } from 'vitest';
import type { TerrainLevel } from './terrainIndexTypes';
import {
  groundScale,
  mercatorLat,
  mercatorLng,
  mercatorX,
  mercatorY,
  meshGridSize,
  meshIndices,
  sampleMosaic,
  terrainMesh,
} from './terrainMesh';
import type { Mosaic } from './terrainMosaic';
import { harnessOrigin, terrainHarness } from './terrainTestHarness';
import { laeaToWgs84 } from './projection';

const level = { id: 'detail', resolutionM: 1 } as unknown as TerrainLevel;

/** 3 × 3 Zellen, Zeile 0 ist die nördlichste. */
const mosaic = (values: number[]): Mosaic => ({
  values: Float32Array.from(values),
  cols: 3,
  rows: 3,
  colMin: 100,
  rowMax: 200,
  level,
});

describe('Mercator hin und zurück', () => {
  it('trifft den Ausgangswert', () => {
    expect(mercatorLng(mercatorX(16.84))).toBeCloseTo(16.84, 9);
    expect(mercatorLat(mercatorY(47.95))).toBeCloseTo(47.95, 9);
  });
});

describe('groundScale', () => {
  it('macht aus Mercator-Metern Geländemeter', () => {
    // Auf 47,95° überzeichnet Mercator um 1/cos = 1,493.
    expect(groundScale(47.95)).toBeCloseTo(0.6698, 4);
  });

  it('ist die Umkehrung der Mercator-Überzeichnung', () => {
    // Ein Kilometer Gelände muss 1000 Einheiten sein, nicht 1493.
    const lat = 47.95;
    const west = mercatorX(16.84);
    const east = mercatorX(16.84 + 0.01);
    const groundM = (east - west) * groundScale(lat);
    // 0,01° Länge auf 47,95° Breite sind 745,6 m.
    expect(groundM).toBeCloseTo(745.6, 0);
  });
});

describe('meshGridSize', () => {
  it('hält das Budget ein', () => {
    const { cols, rows } = meshGridSize(2000, 1000, 65_536, 5000, 5000);
    expect(cols * rows).toBeLessThanOrEqual(65_536);
    expect(cols).toBeGreaterThan(rows);
  });

  it('geht nie über die Auflösung der Quelle hinaus', () => {
    const { cols, rows } = meshGridSize(1000, 1000, 65_536, 40, 30);
    expect(cols).toBe(40);
    expect(rows).toBe(30);
  });
});

describe('sampleMosaic', () => {
  it('interpoliert bilinear', () => {
    const m = mosaic([0, 10, 20, 0, 10, 20, 0, 10, 20]);
    // Pixelmitte der Spalte 0 liegt auf e = 100, die der Spalte 1 auf 101.
    expect(sampleMosaic(m, 100.5, 200)).toBeCloseTo(5, 6);
  });

  it('liefert NaN, wenn einer der vier Nachbarn fehlt', () => {
    const m = mosaic([0, Number.NaN, 20, 0, 10, 20, 0, 10, 20]);
    expect(Number.isNaN(sampleMosaic(m, 100.5, 200))).toBe(true);
  });

  it('liefert NaN außerhalb des Mosaiks', () => {
    const m = mosaic([0, 10, 20, 0, 10, 20, 0, 10, 20]);
    expect(Number.isNaN(sampleMosaic(m, 90, 200))).toBe(true);
  });
});

describe('meshIndices', () => {
  it('erzeugt zwei Dreiecke je Zelle', () => {
    const indices = meshIndices(2, 2, new Uint8Array(4));
    expect(indices.length).toBe(6);
  });

  it('lässt Dreiecke mit einem Loch als Eckpunkt weg', () => {
    const holes = new Uint8Array([0, 0, 0, 1]);
    const indices = meshIndices(2, 2, holes);
    // Nur das Dreieck ohne den Eckpunkt 3 bleibt.
    expect(Array.from(indices)).toEqual([0, 2, 1]);
  });
});

describe('terrainMesh', () => {
  const BLOCK_PX = 8;
  const GRID = 4; // 32 m × 32 m
  const { e0, n0 } = harnessOrigin(BLOCK_PX);

  /** Höhe = Abstand von der Südkante: ein gleichmäßiger Hang nach Norden. */
  const store = () =>
    terrainHarness({
      blockPx: BLOCK_PX,
      grid: GRID,
      height: (col, row) => -row - n0,
    }).store;

  /** Lat/Lon-Rechteck über der Mitte des abgedeckten Gitters. */
  const bounds = (() => {
    const corners = [
      laeaToWgs84({ e: e0 + 4, n: n0 + 4 }),
      laeaToWgs84({ e: e0 + 4, n: n0 + 28 }),
      laeaToWgs84({ e: e0 + 28, n: n0 + 4 }),
      laeaToWgs84({ e: e0 + 28, n: n0 + 28 }),
    ];
    return {
      south: Math.min(...corners.map((c) => c[0])),
      north: Math.max(...corners.map((c) => c[0])),
      west: Math.min(...corners.map((c) => c[1])),
      east: Math.max(...corners.map((c) => c[1])),
    };
  })();

  it('baut ein Netz mit Höhen aus dem Mosaik', async () => {
    const mesh = await terrainMesh(store(), bounds, 1024);
    expect(mesh).toBeDefined();
    expect(mesh!.cols * mesh!.rows).toBeLessThanOrEqual(1024);
    expect(mesh!.indices.length).toBeGreaterThan(0);
    expect(mesh!.level).toBe('detail');
    // Der Hang steigt von Süd nach Nord über rund 24 m Höhenunterschied.
    expect(mesh!.maxM - mesh!.minM).toBeGreaterThan(10);
  });

  it('rechnet in Geländemetern, nicht in Mercator-Metern', async () => {
    const mesh = await terrainMesh(store(), bounds, 1024);
    // Der Ausschnitt ist 24 m breit; in Mercator-Metern wären es rund 36.
    expect(mesh!.widthM).toBeGreaterThan(20);
    expect(mesh!.widthM).toBeLessThan(30);
  });

  it('legt den Ursprung in die Mitte des Ausschnitts', async () => {
    const mesh = await terrainMesh(store(), bounds, 1024);
    const last = mesh!.cols * mesh!.rows - 1;
    // Nordwestecke liegt bei -x/-z, Südostecke spiegelbildlich.
    expect(mesh!.positions[0]).toBeCloseTo(-mesh!.positions[last * 3], 3);
    expect(mesh!.positions[2]).toBeCloseTo(-mesh!.positions[last * 3 + 2], 3);
  });

  it('gibt ohne Index kein Netz zurück', async () => {
    const empty = {
      index: async () => undefined,
    } as unknown as Parameters<typeof terrainMesh>[0];
    expect(await terrainMesh(empty, bounds)).toBeUndefined();
  });
});
