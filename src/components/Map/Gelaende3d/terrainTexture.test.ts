// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { availableLayers } from '../tiles';
import { findLayerConfig, tileGrid, tileUrl, wmsUrl } from './terrainTexture';

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
  it('fordert ein Bild über das Mercator-Rechteck an', () => {
    const grid = tileGrid(neusiedl, 17, undefined, 2048);
    const url = wmsUrl(availableLayers.orthofoto_bgld, grid);
    expect(url).toContain('CRS=EPSG%3A3857');
    expect(url).toContain(`WIDTH=${grid.widthPx}`);
    expect(url).toContain('REQUEST=GetMap');
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
