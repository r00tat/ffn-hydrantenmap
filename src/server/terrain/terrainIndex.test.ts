import { describe, expect, it } from 'vitest';
import {
  decodeAvailability,
  hasBlock,
} from '../../common/terrain/availability';
import { blockId, type BlockRef } from '../../common/terrain/grid';
import { terrainLevel } from '../../common/terrain/terrainIndexTypes';
import type { AdriaOffsetGrid } from '../../common/terrain/terrainIndexTypes';
import { buildIndex } from './terrainIndex';

const bounds = {
  detail: { eMin: 4_775_000, eMax: 4_780_000, nMin: 2_653_000, nMax: 2_658_000 },
  overview: {
    eMin: 4_770_000,
    eMax: 4_790_000,
    nMin: 2_650_000,
    nMax: 2_670_000,
  },
};

const offset: AdriaOffsetGrid = {
  latMin: 46.7,
  lonMin: 16.1,
  latStep: 0.05,
  lonStep: 0.07,
  cols: 1,
  rows: 1,
  baseMm: 410,
  values: 'AA==',
  meanM: 0.41,
  minM: 0.41,
  maxM: 0.41,
  sourcePoints: 1,
};

const detailBlock = (e: number, n: number): BlockRef => ({
  e,
  n,
  sizeM: 1000,
});
const overviewBlock = (e: number, n: number): BlockRef => ({
  e,
  n,
  sizeM: 10_000,
});

const index = (
  detail: BlockRef[],
  overview: BlockRef[] = []
) =>
  buildIndex(
    bounds,
    {
      detail: detail.map(blockId),
      overview: overview.map(blockId),
    },
    offset,
    '2026-08-24T00:00:00.000Z'
  );

const availability = (
  built: ReturnType<typeof index>,
  levelId: 'detail' | 'overview'
) => {
  const level = terrainLevel(built, levelId);
  if (!level) throw new Error(`Stufe fehlt: ${levelId}`);
  return { level, lookup: decodeAvailability(level.availability) };
};

describe('buildIndex', () => {
  it('markiert genau die vorhandenen Blöcke', () => {
    const vorhanden = detailBlock(4_776_000, 2_654_000);
    const { level, lookup } = availability(
      index([vorhanden]),
      'detail'
    );

    expect(lookup.count()).toBe(1);
    expect(hasBlock(level, lookup, vorhanden)).toBe(true);
    expect(hasBlock(level, lookup, detailBlock(4_777_000, 2_654_000))).toBe(
      false
    );
  });

  it('spannt die Bitmap über die Bounding-Box der Stufe', () => {
    const { level } = availability(index([]), 'detail');
    expect(level.availability.cols).toBe(5);
    expect(level.availability.rows).toBe(5);
    expect(level.blockSizeM).toBe(1000);
  });

  /**
   * Der Fehler, um den es hier geht: der Index wurde aus dem gebaut, was der
   * laufende Import erzeugt hat. Ein Lauf mit `--level detail` schrieb damit
   * eine leere Übersichts-Bitmap — und die bereits hochgeladenen
   * Übersichtskacheln waren für jeden Client verschwunden.
   */
  it('behält die Übersichtsstufe, wenn nur die Detailstufe gebaut wurde', () => {
    const uebersicht = overviewBlock(4_770_000, 2_650_000);
    const built = index([detailBlock(4_776_000, 2_654_000)], [uebersicht]);

    const detail = availability(built, 'detail');
    const overview = availability(built, 'overview');
    expect(detail.lookup.count()).toBe(1);
    expect(overview.lookup.count()).toBe(1);
    expect(hasBlock(overview.level, overview.lookup, uebersicht)).toBe(true);
  });

  /**
   * Die Gegenrichtung: ein Lauf mit `--level overview` meldete alle Kandidaten
   * der Detailstufe als vorhanden, auch die nie gebauten. Jeder Client hätte
   * sie einzeln als 404 abgeholt — genau das, was die Bitmap verhindern soll.
   */
  it('meldet keine Detailblöcke, wenn keine gebaut wurden', () => {
    const built = index([], [overviewBlock(4_770_000, 2_650_000)]);
    expect(availability(built, 'detail').lookup.count()).toBe(0);
    expect(availability(built, 'overview').lookup.count()).toBe(1);
  });

  it('übergeht eine Kachel mit fremder Blockgröße', () => {
    // Im Ausgabeverzeichnis kann nach einem Wechsel der Blockgröße eine
    // Kachel aus einem früheren Lauf liegen.
    const built = buildIndex(
      bounds,
      { detail: ['CRS3035RES500mN2654000E4776000'], overview: [] },
      offset,
      '2026-08-24T00:00:00.000Z'
    );
    expect(availability(built, 'detail').lookup.count()).toBe(0);
  });

  it('übergeht einen Block außerhalb der Bounding-Box', () => {
    const built = index([detailBlock(4_900_000, 2_654_000)]);
    expect(availability(built, 'detail').lookup.count()).toBe(0);
  });

  it('übergeht einen unlesbaren Namen', () => {
    const built = buildIndex(
      bounds,
      { detail: ['kein-blockname'], overview: [] },
      offset,
      '2026-08-24T00:00:00.000Z'
    );
    expect(availability(built, 'detail').lookup.count()).toBe(0);
  });

  it('trägt Kodierung, Höhensystem und Namensnennung mit', () => {
    const built = index([]);
    expect(built.crs).toBe('EPSG:3035');
    expect(built.heightDatum).toBe('EVRF2000');
    expect(built.adriaOffset.meanM).toBe(0.41);
    expect(built.source.license).toBe('CC BY 4.0');
    for (const level of built.levels) {
      // `base` und `step` stehen im Index, damit ein Wechsel der Präzision
      // eine reine Neuerzeugung der Kacheln bleibt.
      expect(level.step).toBe(0.1);
      expect(level.nodataValue).toBe(0xffffff);
    }
  });
});
