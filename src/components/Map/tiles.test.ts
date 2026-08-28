// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { FirecallMapLayer } from '../../common/mapLayers';
import {
  mapLayerConfigKey,
  mapLayerTileConfigs,
  mapLayerToTileConfig,
  overlayLayers,
} from './tiles';

const wms: FirecallMapLayer = {
  id: 'a',
  name: 'Orthofoto',
  overlayType: 'WMS',
  url: 'https://gis.example.at/wms?',
  wmsLayers: '1',
  opacity: 0.5,
  bounds: '46.82,15.98,48.16,17.17',
  attribution: '<a href="https://x">Land</a>',
};

describe('mapLayerToTileConfig', () => {
  it('übersetzt eine WMS-Ebene', () => {
    const config = mapLayerToTileConfig(wms);
    expect(config.type).toBe('WMS');
    expect(config.name).toBe('Karte: Orthofoto');
    expect(config.options.layers).toBe('1');
    expect(config.options.format).toBe('image/png');
    expect(config.options.uppercase).toBe(true);
    expect(config.options.opacity).toBe(0.5);
    expect(config.options.bounds).toEqual([
      [46.82, 15.98],
      [48.16, 17.17],
    ]);
  });

  it('entfernt Markup aus der Quellenangabe', () => {
    expect(mapLayerToTileConfig(wms).options.attribution).toBe('Land');
  });

  it('führt bei einer Kachel-Ebene keine WMS-Optionen mit', () => {
    const config = mapLayerToTileConfig({
      name: 'Kacheln',
      overlayType: 'WMTS',
      url: 'https://a.org/{z}/{x}/{y}.png',
    });
    expect(config.type).toBe('WMTS');
    expect(config.options.layers).toBeUndefined();
    expect(config.options.opacity).toBe(1);
  });

  it('setzt Zoomgrenzen vor, wenn nichts angegeben ist', () => {
    const config = mapLayerToTileConfig(wms);
    expect(config.options.maxZoom).toBe(24);
    expect(config.options.maxNativeZoom).toBe(19);
  });
});

describe('mapLayerTileConfigs', () => {
  it('lässt eine unsichere Ebene weg', () => {
    const configs = mapLayerTileConfigs([
      wms,
      { name: 'böse', overlayType: 'WMTS', url: 'javascript:alert(1)' },
    ]);
    expect(configs.map((c) => c.name)).toEqual(['Karte: Orthofoto']);
  });

  it('vergibt eindeutige Namen', () => {
    const configs = mapLayerTileConfigs([wms, { ...wms, id: 'b' }]);
    expect(configs.map((c) => c.name)).toEqual([
      'Karte: Orthofoto',
      'Karte: Orthofoto (2)',
    ]);
  });
});

describe('mapLayerConfigKey', () => {
  // react-leaflet übernimmt an einer laufenden Kachelebene nur opacity, zIndex
  // und (bei einer reinen Kachelebene) die URL. Alles andere muss über den
  // React-Key einen Neuaufbau auslösen, sonst wirkt eine Bearbeitung erst nach
  // dem Neuladen der Seite.
  it('ändert sich, wenn sich der LAYERS-Wert ändert', () => {
    expect(mapLayerConfigKey(mapLayerToTileConfig(wms))).not.toBe(
      mapLayerConfigKey(mapLayerToTileConfig({ ...wms, wmsLayers: '2' }))
    );
  });

  it('ändert sich, wenn sich die Begrenzung ändert', () => {
    expect(mapLayerConfigKey(mapLayerToTileConfig(wms))).not.toBe(
      mapLayerConfigKey(
        mapLayerToTileConfig({ ...wms, bounds: '47,16,48,17' })
      )
    );
  });

  it('bleibt gleich, wenn sich nur die Deckkraft ändert', () => {
    expect(mapLayerConfigKey(mapLayerToTileConfig(wms))).toBe(
      mapLayerConfigKey(mapLayerToTileConfig({ ...wms, opacity: 0.1 }))
    );
  });
});

describe('overlayLayers', () => {
  it('kennt keinen Typ WTMS mehr', () => {
    // Der Tippfehler ließ jede Ebene mit korrektem `type: 'WMTS'` aus beiden
    // Filtern in Map.tsx fallen; sie wurde gar nicht gerendert.
    const types = Object.values(overlayLayers).map((l) => l.type);
    expect(types.every((t) => t === undefined || t === 'WMS' || t === 'WMTS')).toBe(
      true
    );
  });
});
