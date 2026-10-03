// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { availableLayers, overlayLayers } from '../components/Map/tiles';
import {
  isOfflineTileUrl,
  OFFLINE_TILE_MAX_TILES,
  OFFLINE_TILE_SOURCES,
  planOfflineTiles,
  tileUrl,
  tilesAround,
} from './offlineTiles';

const NEUSIEDL = { lat: 47.948, lng: 16.842 };

describe('offlineTiles', () => {
  it('nimmt nur basemap.at auf, keine OSM-/OpenTopoMap-Kacheln', () => {
    const ids = OFFLINE_TILE_SOURCES.map((s) => s.id);
    expect(ids).not.toContain('openstreetmap');
    expect(ids).not.toContain('opentopomap');
    for (const source of OFFLINE_TILE_SOURCES) {
      expect(source.url).toMatch(/^https:\/\/maps\{s\}\.wien\.gv\.at\/basemap\//);
    }
  });

  it('verwendet exakt die Kachel-URLs der Karte (sonst träfe der Cache nie)', () => {
    for (const source of OFFLINE_TILE_SOURCES) {
      const layer = availableLayers[source.id] ?? overlayLayers[source.id];
      expect(layer, source.id).toBeDefined();
      expect(source.url).toBe(layer.url);
      expect(source.subdomains).toEqual(layer.options.subdomains);
    }
  });

  it('berechnet die Kachel am Einsatzort', () => {
    const [tile] = tilesAround(NEUSIEDL, 1, 16, 16);
    expect(tile).toEqual({ z: 16, x: 35833, y: 22795 });
  });

  it('deckt den Umkreis je Zoomstufe ab', () => {
    const tiles = tilesAround(NEUSIEDL, 1000, 13, 18);
    const z18 = tiles.filter((t) => t.z === 18);
    // 2 km Kantenlänge, Kachel bei 48° rund 100 m breit
    expect(z18.length).toBeGreaterThan(300);
    expect(z18.length).toBeLessThan(600);
    expect(tiles.filter((t) => t.z === 13).length).toBeLessThanOrEqual(4);
    expect(new Set(tiles.map((t) => t.z))).toEqual(
      new Set([13, 14, 15, 16, 17, 18]),
    );
  });

  it('setzt Zoom, Zeile und Spalte wie Leaflet ein', () => {
    const source = OFFLINE_TILE_SOURCES.find((s) => s.id === 'basemap_hdpi')!;
    expect(tileUrl(source, { z: 16, x: 35833, y: 22795 })).toBe(
      'https://mapsneu.wien.gv.at/basemap/bmaphidpi/normal/google3857/16/22795/35833.jpeg',
    );
  });

  it('plant Adressen und Größe für die gewählten Ebenen', () => {
    const plan = planOfflineTiles({
      center: NEUSIEDL,
      radiusM: 1000,
      sourceIds: ['basemap_hdpi', 'adressen'],
    });
    const perLayer = tilesAround(NEUSIEDL, 1000, 13, 18).length;
    expect(plan.tileCount).toBe(perLayer * 2);
    expect(plan.urls).toHaveLength(perLayer * 2);
    expect(plan.estimatedBytes).toBeGreaterThan(0);
    expect(plan.tooLarge).toBe(false);
  });

  it('lehnt zu große Gebiete ab', () => {
    const plan = planOfflineTiles({
      center: NEUSIEDL,
      radiusM: 10_000,
      sourceIds: ['basemap_hdpi'],
    });
    expect(plan.tileCount).toBeGreaterThan(OFFLINE_TILE_MAX_TILES);
    expect(plan.tooLarge).toBe(true);
  });

  it('ignoriert unbekannte Ebenen', () => {
    const plan = planOfflineTiles({
      center: NEUSIEDL,
      radiusM: 500,
      sourceIds: ['openstreetmap'],
    });
    expect(plan.tileCount).toBe(0);
  });

  it('erkennt die Kachel-URLs für die Service-Worker-Regel', () => {
    expect(
      isOfflineTileUrl(
        new URL('https://mapsneu.wien.gv.at/basemap/bmaphidpi/normal/google3857/1/1/1.jpeg'),
      ),
    ).toBe(true);
    expect(
      isOfflineTileUrl(new URL('https://a.tile.openstreetmap.org/1/1/1.png')),
    ).toBe(false);
    expect(
      isOfflineTileUrl(new URL('https://mapsneu.wien.gv.at/andere/1.png')),
    ).toBe(false);
  });
});
