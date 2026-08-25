// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { availableLayers, overlayLayers } from '../tiles';
import {
  activeOverlays,
  findLayerConfig,
  tileGrid,
  TILE_PX,
  tileUrl,
  wmsBlocks,
  WMS_TILE_PX,
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
    expect(url).toContain(`WIDTH=${WMS_TILE_PX}`);
    expect(url).toContain(`HEIGHT=${WMS_TILE_PX}`);
    expect(url).toContain('LAYERS=ofa_maxd');
    expect(url).toContain('TRANSPARENT=TRUE');
  });
});

describe('wmsBlocks', () => {
  /** Der übliche Fall: ein Bildschirmausschnitt, Textur auf 2048 px gedeckelt. */
  const grid = tileGrid(neusiedl, 19, undefined, 2048);

  it('liegt auf Leaflets Kachelraster', () => {
    // Der Dienst ist ein Kachel-Cache und lehnt jedes andere Rechteck ab. Ein
    // 512er-Feld deckt 2 × 2 Kacheln ab, sein Rechteck ist also eine Kachel des
    // 256er-Rasters eine Stufe gröber.
    const span = (2 * 20_037_508.342789244) / 2 ** (grid.z - 1);
    for (const block of wmsBlocks(grid)) {
      const index = (block.box.xMin + 20_037_508.342789244) / span;
      expect(index).toBeCloseTo(Math.round(index), 6);
      expect(block.box.xMax - block.box.xMin).toBeCloseTo(span, 6);
      expect(block.box.yMax - block.box.yMin).toBeCloseTo(span, 6);
    }
  });

  it('deckt den ganzen Ausschnitt ab', () => {
    const blocks = wmsBlocks(grid);
    expect(blocks.length).toBeGreaterThan(0);
    expect(Math.min(...blocks.map((b) => b.dx))).toBeLessThanOrEqual(0);
    expect(Math.min(...blocks.map((b) => b.dy))).toBeLessThanOrEqual(0);
    expect(
      Math.max(...blocks.map((b) => b.dx + b.sizePx))
    ).toBeGreaterThanOrEqual(grid.widthPx);
    expect(
      Math.max(...blocks.map((b) => b.dy + b.sizePx))
    ).toBeGreaterThanOrEqual(grid.heightPx);
  });

  it('zeichnet unverändert ein, ohne zu skalieren', () => {
    // 512 Texturpixel entfallen auf ein Feld — dieselbe Auflösung wie die
    // Kacheln daneben.
    for (const block of wmsBlocks(grid)) {
      expect(block.sizePx).toBe(WMS_TILE_PX);
      expect(block.sizePx).toBe(2 * TILE_PX);
    }
  });

  it('setzt die Ziel-Ecke auf ein Vielfaches der Kachelbreite', () => {
    for (const block of wmsBlocks(grid)) {
      expect(Math.abs(block.dx) % TILE_PX).toBe(0);
      expect(Math.abs(block.dy) % TILE_PX).toBe(0);
    }
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
