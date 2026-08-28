import { describe, expect, it } from 'vitest';
import {
  deriveMapLayerSettings,
  preferredFormat,
  supportsLeafletCrs,
  unionBounds,
} from './mapLayerFromCapabilities';
import type { WmsCapabilitiesLayer } from './wmsCapabilities';

const layer = (
  overrides: Partial<WmsCapabilitiesLayer> = {}
): WmsCapabilitiesLayer => ({
  name: 'ortho',
  title: 'Orthofoto',
  crs: ['EPSG:4326', 'EPSG:3857'],
  depth: 0,
  ...overrides,
});

describe('supportsLeafletCrs', () => {
  it('erkennt EPSG:3857', () => {
    expect(supportsLeafletCrs(layer())).toBe(true);
  });

  it('lässt die alten Schreibweisen desselben Systems gelten', () => {
    expect(supportsLeafletCrs(layer({ crs: ['EPSG:900913'] }))).toBe(true);
    expect(supportsLeafletCrs(layer({ crs: ['epsg:102100'] }))).toBe(true);
  });

  it('meldet einen Dienst ohne Web-Mercator', () => {
    expect(supportsLeafletCrs(layer({ crs: ['EPSG:31256'] }))).toBe(false);
  });

  it('verdächtigt einen Dienst nicht, der gar nichts meldet', () => {
    // Die Angabe ist vererbbar und fehlt in der Praxis oft ganz.
    expect(supportsLeafletCrs(layer({ crs: [] }))).toBe(true);
    // Und sie kommt über eine Server Action herein, kann also ganz fehlen.
    expect(
      supportsLeafletCrs({ ...layer(), crs: undefined as never })
    ).toBe(true);
  });
});

describe('unionBounds', () => {
  it('umschließt mehrere Ausdehnungen', () => {
    expect(
      unionBounds(['46.8,15.9,48.1,17.1', '46.2,9.5,49.1,17.3'])
    ).toBe('46.2,9.5,49.1,17.3');
  });

  it('übergeht leere und kaputte Angaben', () => {
    expect(unionBounds([undefined, '1,2', '46.8,15.9,48.1,17.1'])).toBe(
      '46.8,15.9,48.1,17.1'
    );
  });

  it('gibt ohne brauchbare Angabe undefined zurück', () => {
    expect(unionBounds([undefined, ''])).toBeUndefined();
  });
});

describe('preferredFormat', () => {
  it('nimmt PNG für eine Überlagerung — nur das kann Transparenz', () => {
    expect(preferredFormat(['image/jpeg', 'image/png'])).toBe('image/png');
  });

  it('nimmt JPEG für eine flächendeckende Ebene — die kleinere Kachel', () => {
    expect(preferredFormat(['image/png', 'image/jpeg'], true)).toBe(
      'image/jpeg'
    );
  });

  it('fällt auf den ersten Vorschlag des Dienstes zurück', () => {
    expect(preferredFormat(['image/png; mode=8bit', 'image/tiff'])).toBe(
      'image/png; mode=8bit'
    );
  });

  it('gibt ohne Angebot nichts zurück', () => {
    expect(preferredFormat([])).toBeUndefined();
  });
});

describe('deriveMapLayerSettings', () => {
  const capabilities = {
    title: 'Geodaten Burgenland',
    formats: ['image/png', 'image/jpeg'],
  };

  it('übernimmt Titel, Beschreibung, Ausdehnung und Zoomgrenze', () => {
    const { settings } = deriveMapLayerSettings(
      [
        layer({
          abstract: 'Luftbild, 20 cm',
          bounds: '46.8,15.9,48.1,17.1',
          maxNativeZoom: 19,
          attribution: 'Land Burgenland',
        }),
      ],
      capabilities
    );
    expect(settings).toEqual({
      name: 'Orthofoto',
      beschreibung: 'Luftbild, 20 cm',
      wmsLayers: 'ortho',
      format: 'image/png',
      transparent: true,
      bounds: '46.8,15.9,48.1,17.1',
      maxNativeZoom: 19,
      attribution: 'Land Burgenland',
    });
  });

  it('macht aus opaque JPEG ohne Transparenz', () => {
    const { settings } = deriveMapLayerSettings(
      [layer({ opaque: true })],
      capabilities
    );
    expect(settings.format).toBe('image/jpeg');
    expect(settings.transparent).toBe(false);
  });

  it('entfernt Markup aus der Quellenangabe des Dienstes', () => {
    const { settings } = deriveMapLayerSettings(
      [layer({ attribution: '<a href="https://x">Land</a>' })],
      capabilities
    );
    expect(settings.attribution).toBe('Land');
  });

  it('reiht mehrere Layer in den LAYERS-Parameter', () => {
    const { settings } = deriveMapLayerSettings(
      [layer({ name: 'a' }), layer({ name: 'b' })],
      capabilities
    );
    expect(settings.wmsLayers).toBe('a,b');
  });

  it('nimmt bei mehreren Layern den Titel des Dienstes', () => {
    const { settings } = deriveMapLayerSettings(
      [layer({ name: 'a' }), layer({ name: 'b' })],
      capabilities
    );
    expect(settings.name).toBe('Geodaten Burgenland');
    // Zwei Beschreibungen aneinandergehängt ergäben nur einen Textklumpen.
    expect(settings.beschreibung).toBeUndefined();
  });

  it('vereinigt die Ausdehnungen — der engste Layer darf nicht abschneiden', () => {
    const { settings } = deriveMapLayerSettings(
      [
        layer({ name: 'a', bounds: '46.8,15.9,48.1,17.1' }),
        layer({ name: 'b', bounds: '46.2,9.5,49.1,17.3' }),
      ],
      capabilities
    );
    expect(settings.bounds).toBe('46.2,9.5,49.1,17.3');
  });

  it('nimmt die kleinste Zoomgrenze — sonst liefert einer nichts mehr', () => {
    const { settings } = deriveMapLayerSettings(
      [
        layer({ name: 'a', maxNativeZoom: 19 }),
        layer({ name: 'b', maxNativeZoom: 14 }),
      ],
      capabilities
    );
    expect(settings.maxNativeZoom).toBe(14);
  });

  it('setzt keine Zoomgrenze, wenn sie nicht für alle gilt', () => {
    // Sonst würde die Grenze eines Layers stillschweigend allen auferlegt.
    const { settings } = deriveMapLayerSettings(
      [layer({ name: 'a', maxNativeZoom: 14 }), layer({ name: 'b' })],
      capabilities
    );
    expect(settings.maxNativeZoom).toBeUndefined();
  });

  it('meldet einen Layer, den Leaflet nicht anfragen kann', () => {
    const { unsupportedCrs } = deriveMapLayerSettings(
      [
        layer({ name: 'a' }),
        layer({ name: 'b', title: 'Nur GK M34', crs: ['EPSG:31256'] }),
      ],
      capabilities
    );
    expect(unsupportedCrs).toEqual(['Nur GK M34']);
  });

  it('kommt mit leerer Auswahl zurecht', () => {
    expect(deriveMapLayerSettings([], capabilities)).toEqual({
      settings: { name: '', wmsLayers: '' },
      unsupportedCrs: [],
    });
  });
});
