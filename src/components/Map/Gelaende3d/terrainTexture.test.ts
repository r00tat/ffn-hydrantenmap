// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { availableLayers, overlayLayers } from '../tiles';
import {
  activeOverlays,
  findLayerConfig,
  tileGrid,
  tileUrl,
  MIN_WMS_ZOOM,
  wmsBlocks,
  WMS_BLOCK_PX,
  wmsUrl,
} from './terrainTexture';

const neusiedl = { south: 47.94, west: 16.83, north: 47.96, east: 16.87 };

describe('tileGrid', () => {
  it('bleibt im Pixelbudget', () => {
    const grid = tileGrid(neusiedl, 19, undefined, 2048);
    expect(grid.widthPx).toBeLessThanOrEqual(2048);
    expect(grid.heightPx).toBeLessThanOrEqual(2048);
  });

  it('nimmt die feinste Stufe, die noch passt', () => {
    const grid = tileGrid(neusiedl, 19, undefined, 2048);
    const finer = tileGrid(neusiedl, 19, undefined, 4096);
    expect(finer.z).toBeGreaterThan(grid.z);
  });

  it('geht nicht über maxNativeZoom hinaus', () => {
    const grid = tileGrid(neusiedl, 24, availableLayers.basemap_ortofoto, 8192);
    expect(grid.z).toBeLessThanOrEqual(19);
  });

  it('deckt den Ausschnitt vollständig ab', () => {
    const grid = tileGrid(neusiedl, 19, undefined, 2048);
    // Das Mercator-Rechteck der Kacheln muss über die Bounds hinausreichen.
    const westM = (16.83 / 180) * 20_037_508.342789244;
    const eastM = (16.87 / 180) * 20_037_508.342789244;
    expect(grid.merc.xMin).toBeLessThanOrEqual(westM);
    expect(grid.merc.xMax).toBeGreaterThanOrEqual(eastM);
  });
});

describe('tileUrl', () => {
  it('setzt Zoom, x, y und Subdomain ein', () => {
    const url = tileUrl(availableLayers.basemap_ortofoto, 3, 5, 17);
    expect(url).toContain('/17/5/3.jpeg');
    expect(url).toContain('mapsneu.wien.gv.at');
  });
});

describe('wmsUrl', () => {
  const box = { xMin: 100, yMin: 200, xMax: 1100, yMax: 1200 };

  it('fordert ein Bild über das Mercator-Rechteck an', () => {
    const url = wmsUrl(availableLayers.orthofoto_bgld, box);
    expect(url).toContain('SRS=EPSG%3A3857');
    expect(url).toContain('REQUEST=GetMap');
    expect(url).toContain('BBOX=100%2C200%2C1100%2C1200');
  });

  it('fragt in Version 1.1.1 und mit 512 px, wie Leaflet es tut', () => {
    // Der WISA-Dienst beantwortet 1.3.0 mit 400 und jede andere Kantenlänge
    // ebenfalls; die Gefahrenkarten fehlten dann in der Textur, ohne dass es
    // auffiele.
    const url = wmsUrl(overlayLayers.oberflaechenwasser, box);
    expect(url).toContain('VERSION=1.1.1');
    expect(url).not.toContain('CRS=');
    expect(url).toContain(`WIDTH=${WMS_BLOCK_PX}`);
    expect(url).toContain(`HEIGHT=${WMS_BLOCK_PX}`);
    expect(url).toContain('LAYERS=ofa_maxd');
    expect(url).toContain('TRANSPARENT=TRUE');
  });
});

describe('wmsBlocks', () => {
  /** Der übliche Fall: ein Bildschirmausschnitt, Textur auf 2048 px gedeckelt. */
  const grid = tileGrid(neusiedl, 19, undefined, 2048);

  it('deckt das Bild lückenlos ab und beginnt oben links', () => {
    const blocks = wmsBlocks(grid);
    const size = blocks[0].sizePx;
    expect(blocks).toHaveLength(
      Math.ceil(grid.widthPx / size) * Math.ceil(grid.heightPx / size)
    );
    expect(blocks[0].dx).toBe(0);
    expect(blocks[0].dy).toBe(0);
    expect(blocks[0].box.xMin).toBeCloseTo(grid.merc.xMin, 6);
    expect(blocks[0].box.yMax).toBeCloseTo(grid.merc.yMax, 6);
  });

  it('fragt feiner an als die Textur ist', () => {
    // Die Textur landet bei diesem Ausschnitt auf Stufe 15; der Dienst liefert
    // erst ab Stufe 16. Ohne die feinere Anfrage fehlte die Ebene ganz.
    expect(grid.z).toBeLessThan(MIN_WMS_ZOOM);
    expect(wmsBlocks(grid)[0].sizePx).toBeLessThan(WMS_BLOCK_PX);
  });

  it('hält jeden Block quadratisch und in derselben Auflösung', () => {
    const blocks = wmsBlocks(grid);
    const first = blocks[0].box.xMax - blocks[0].box.xMin;
    for (const block of blocks) {
      const width = block.box.xMax - block.box.xMin;
      const height = block.box.yMax - block.box.yMin;
      // Ein angeschnittener Block hätte einen anderen Maßstab, und den lehnt
      // der Dienst ab.
      expect(width).toBeCloseTo(first, 6);
      expect(height).toBeCloseTo(width, 6);
    }
  });

  it('deckt sich mit dem Maßstab der Textur', () => {
    const resolution = (grid.merc.xMax - grid.merc.xMin) / grid.widthPx;
    const block = wmsBlocks(grid)[0];
    // Was der Block im Bild einnimmt, muss er auch in Metern abdecken.
    expect(block.box.xMax - block.box.xMin).toBeCloseTo(
      block.sizePx * resolution,
      6
    );
  });

  it('lässt die Ebene weg, statt hunderte Anfragen zu stellen', () => {
    // Ein weit gezogener Ausschnitt: die Textur wird grob, der Dienst bliebe
    // fein, und für dieselbe Fläche kämen über zweihundert Blöcke zusammen.
    const wide = tileGrid(
      { south: 47.5, west: 16.2, north: 48.2, east: 17.2 },
      19,
      undefined,
      2048
    );
    expect(wide.z).toBeLessThan(grid.z);
    expect(wmsBlocks(wide)).toHaveLength(0);
  });
});

describe('findLayerConfig', () => {
  it('findet den Layer nach seinem angezeigten Namen', () => {
    expect(findLayerConfig('Basemap')?.url).toContain('bmaphidpi');
  });

  it('fällt ohne Namen auf den ersten Layer zurück', () => {
    expect(findLayerConfig(undefined)?.name).toBe('Orthofoto');
  });
});

describe('activeOverlays', () => {
  it('nimmt die von Haus aus eingeblendeten Überlagerungen', () => {
    const names = activeOverlays({}).map((layer) => layer.name);
    // Nur die Adressen sind vorbelegt (`enabled: true`).
    expect(names).toEqual(['Adressen']);
  });

  it('nimmt eine eingeschaltete Gefahrenkarte dazu', () => {
    const names = activeOverlays({
      'Hochwasser Oberflächenwasser': true,
    }).map((layer) => layer.name);
    expect(names).toContain('Hochwasser Oberflächenwasser');
    expect(names).toContain('Adressen');
  });

  it('lässt eine ausgeschaltete Überlagerung weg', () => {
    const names = activeOverlays({ Adressen: false }).map(
      (layer) => layer.name
    );
    expect(names).toEqual([]);
  });

  it('hält die Reihenfolge der Konfiguration als Stapelung', () => {
    const names = activeOverlays({
      'Hochwasser Oberflächenwasser': true,
      Adressen: true,
    }).map((layer) => layer.name);
    // Adressen stehen in `tiles.ts` zuerst und liegen damit unten.
    expect(names.indexOf('Adressen')).toBeLessThan(
      names.indexOf('Hochwasser Oberflächenwasser')
    );
  });
});
