// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WMS_TILE_SIZE,
  availableLayers,
  overlayLayers,
  wmsTileSize,
  type TileConfig,
} from './tiles';

describe('wmsTileSize', () => {
  it('liefert den Standard, wenn die Konfiguration nichts vorgibt', () => {
    const config: TileConfig = {
      name: 'Test',
      url: 'https://example.org/wms?',
      type: 'WMS',
      options: {},
    };

    expect(wmsTileSize(config)).toBe(DEFAULT_WMS_TILE_SIZE);
  });

  it('bevorzugt die Angabe aus der Konfiguration', () => {
    const config: TileConfig = {
      name: 'Test',
      url: 'https://example.org/wms?',
      type: 'WMS',
      options: { tileSize: 256 },
    };

    expect(wmsTileSize(config)).toBe(256);
  });

  it('verlangt für die WISA-Kacheln 512 — kleinere Kacheln quittiert der Dienst mit 400', () => {
    const wisa = Object.values(overlayLayers).filter((layer) =>
      layer.url.includes('tiles.lfrz.gv.at')
    );

    expect(wisa.length).toBeGreaterThan(0);
    wisa.forEach((layer) => expect(wmsTileSize(layer)).toBe(512));
  });

  it('gibt jedem WMS-Layer eine Kachelgröße', () => {
    const wms = [
      ...Object.values(availableLayers),
      ...Object.values(overlayLayers),
    ].filter((layer) => layer.type === 'WMS');

    expect(wms.length).toBeGreaterThan(0);
    wms.forEach((layer) => expect(wmsTileSize(layer)).toBeGreaterThan(0));
  });
});
