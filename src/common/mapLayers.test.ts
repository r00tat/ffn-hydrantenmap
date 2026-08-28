import { describe, expect, it } from 'vitest';
import {
  clampOpacity,
  FirecallMapLayer,
  hasTileTemplatePlaceholders,
  isRenderableMapLayer,
  isSafeMapLayerUrl,
  isValidBoundsInput,
  mapLayerOverlayName,
  normalizeMapLayer,
  parseMapLayerBounds,
  sanitizeAttribution,
  sortMapLayers,
  uniqueOverlayNames,
  validateMapLayer,
} from './mapLayers';

const wms = (overrides: Partial<FirecallMapLayer> = {}): FirecallMapLayer => ({
  name: 'Orthofoto Burgenland',
  overlayType: 'WMS',
  url: 'https://gisenterprise.bgld.gv.at/arcgis/services/public/Orthofoto/MapServer/WMSServer?',
  wmsLayers: '1',
  ...overrides,
});

const wmts = (overrides: Partial<FirecallMapLayer> = {}): FirecallMapLayer => ({
  name: 'Nachbarbezirk',
  overlayType: 'WMTS',
  url: 'https://example.org/tiles/{z}/{x}/{y}.png',
  ...overrides,
});

describe('isSafeMapLayerUrl', () => {
  it('akzeptiert https', () => {
    expect(isSafeMapLayerUrl('https://example.org/wms?')).toBe(true);
  });

  it('lehnt http ab', () => {
    expect(isSafeMapLayerUrl('http://example.org/wms?')).toBe(false);
  });

  it('lehnt javascript: ab', () => {
    expect(isSafeMapLayerUrl('javascript:alert(1)')).toBe(false);
  });

  it('lehnt data: ab', () => {
    expect(isSafeMapLayerUrl('data:text/html,<script>')).toBe(false);
  });

  it('lehnt eingebettete Zugangsdaten ab', () => {
    expect(isSafeMapLayerUrl('https://user:pass@example.org/wms')).toBe(false);
  });

  it('lehnt Unsinn ab', () => {
    expect(isSafeMapLayerUrl('nicht mal eine url')).toBe(false);
    expect(isSafeMapLayerUrl('')).toBe(false);
    expect(isSafeMapLayerUrl(undefined)).toBe(false);
  });
});

describe('hasTileTemplatePlaceholders', () => {
  it('erkennt ein vollständiges Template', () => {
    expect(
      hasTileTemplatePlaceholders('https://a.org/{z}/{x}/{y}.png')
    ).toBe(true);
  });

  it('vermisst einen fehlenden Platzhalter', () => {
    expect(hasTileTemplatePlaceholders('https://a.org/{z}/{x}.png')).toBe(
      false
    );
  });
});

describe('parseMapLayerBounds', () => {
  it('liest süd,west,nord,ost', () => {
    expect(parseMapLayerBounds('46.82, 15.98, 48.16, 17.17')).toEqual([
      [46.82, 15.98],
      [48.16, 17.17],
    ]);
  });

  it('gibt für leere Eingabe undefined zurück', () => {
    expect(parseMapLayerBounds('')).toBeUndefined();
    expect(parseMapLayerBounds(undefined)).toBeUndefined();
  });

  it('lehnt vertauschte Ecken ab', () => {
    expect(parseMapLayerBounds('48.16,15.98,46.82,17.17')).toBeUndefined();
  });

  it('lehnt Werte außerhalb der Erde ab', () => {
    expect(parseMapLayerBounds('-95,15.98,48.16,17.17')).toBeUndefined();
    expect(parseMapLayerBounds('46.82,15.98,48.16,190')).toBeUndefined();
  });

  it('lehnt eine falsche Anzahl an Werten ab', () => {
    expect(parseMapLayerBounds('46.82,15.98,48.16')).toBeUndefined();
  });
});

describe('isValidBoundsInput', () => {
  it('lässt die leere Eingabe durchgehen', () => {
    expect(isValidBoundsInput('')).toBe(true);
    expect(isValidBoundsInput(undefined)).toBe(true);
  });

  it('meldet eine kaputte Eingabe', () => {
    expect(isValidBoundsInput('46.82,15.98')).toBe(false);
  });
});

describe('clampOpacity', () => {
  it('lässt Werte im Bereich stehen', () => {
    expect(clampOpacity(0.4)).toBe(0.4);
  });

  it('begrenzt nach oben und unten', () => {
    expect(clampOpacity(5)).toBe(1);
    expect(clampOpacity(-1)).toBe(0);
  });

  it('nimmt ohne Angabe volle Deckkraft an', () => {
    expect(clampOpacity(undefined)).toBe(1);
    expect(clampOpacity(Number.NaN)).toBe(1);
  });
});

describe('sanitizeAttribution', () => {
  it('entfernt Markup', () => {
    expect(sanitizeAttribution('<a href="https://x">Land</a> (CC BY)')).toBe(
      'Land (CC BY)'
    );
  });

  it('lässt kein Skript stehen', () => {
    const result = sanitizeAttribution(
      '<img src=x onerror="alert(1)">Quelle'
    );
    expect(result).toBe('Quelle');
    expect(result).not.toContain('<');
  });

  it('maskiert übrig gebliebene spitze Klammern', () => {
    expect(sanitizeAttribution('a < b')).toBe('a &lt; b');
  });

  it('gibt für leere Eingabe undefined zurück', () => {
    expect(sanitizeAttribution('')).toBeUndefined();
    expect(sanitizeAttribution('   ')).toBeUndefined();
  });

  // Die eigentliche Zusicherung: Leaflet setzt die Attribution per
  // `innerHTML`. Solange im Ergebnis kein `<` und kein `>` mehr steht, kann
  // daraus kein Element werden — egal, was in der Eingabe stand. Das
  // Entfernen der Tags allein trüge nicht, das Maskieren danach tut es.
  it('lässt unter keinen Umständen eine spitze Klammer stehen', () => {
    const nasty = [
      '<script>alert(1)</script>',
      '<img src="x>" onerror="alert(1)">',
      '<<script>script>alert(1)<</script>/script>',
      '<svg/onload=alert(1)>',
      '<a href="javascript:alert(1)">Quelle</a>',
      '<!-- --><iframe src=//evil></iframe>',
      'a < b > c',
      '<div',
      '>',
    ];
    for (const value of nasty) {
      const result = sanitizeAttribution(value) ?? '';
      expect(result, value).not.toMatch(/[<>]/);
    }
  });
});

describe('mapLayerOverlayName / uniqueOverlayNames', () => {
  it('setzt das Präfix vor den Namen', () => {
    expect(mapLayerOverlayName(wms())).toBe('Karte: Orthofoto Burgenland');
  });

  it('nummeriert doppelte Namen durch', () => {
    expect(
      uniqueOverlayNames([wms(), wms(), wmts({ name: 'Anderes' })])
    ).toEqual([
      'Karte: Orthofoto Burgenland',
      'Karte: Orthofoto Burgenland (2)',
      'Karte: Anderes',
    ]);
  });
});

describe('validateMapLayer', () => {
  it('nimmt eine vollständige WMS-Ebene an', () => {
    expect(validateMapLayer(wms())).toEqual({});
  });

  it('nimmt eine vollständige Kachel-Ebene an', () => {
    expect(validateMapLayer(wmts())).toEqual({});
  });

  it('verlangt einen Namen', () => {
    expect(validateMapLayer(wms({ name: '  ' })).name).toBe('required');
  });

  it('verlangt https', () => {
    expect(validateMapLayer(wms({ url: 'http://a.org/wms' })).url).toBe(
      'httpsRequired'
    );
  });

  it('verlangt bei WMS den LAYERS-Parameter', () => {
    expect(validateMapLayer(wms({ wmsLayers: '' })).wmsLayers).toBe(
      'required'
    );
  });

  it('verlangt bei Kacheln die Platzhalter', () => {
    expect(
      validateMapLayer(wmts({ url: 'https://a.org/tiles.png' })).url
    ).toBe('templateRequired');
  });

  it('meldet eine kaputte Begrenzung', () => {
    expect(validateMapLayer(wms({ bounds: '1,2' })).bounds).toBe(
      'invalidBounds'
    );
  });
});

describe('isRenderableMapLayer', () => {
  it('lässt eine gültige Ebene zu', () => {
    expect(isRenderableMapLayer(wms())).toBe(true);
  });

  it('sperrt eine gelöschte Ebene', () => {
    expect(isRenderableMapLayer(wms({ deleted: true }))).toBe(false);
  });

  it('sperrt eine Ebene mit unsicherer URL, auch wenn sie gespeichert wurde', () => {
    expect(
      isRenderableMapLayer(wms({ url: 'javascript:alert(1)' }))
    ).toBe(false);
  });
});

describe('sortMapLayers', () => {
  it('sortiert nach zIndex, dann nach Namen', () => {
    const layers = [
      wmts({ name: 'C', zIndex: 2 }),
      wmts({ name: 'B', zIndex: 1 }),
      wmts({ name: 'A', zIndex: 1 }),
    ];
    expect(sortMapLayers(layers).map((l) => l.name)).toEqual(['A', 'B', 'C']);
  });

  it('lässt die Eingabe unverändert', () => {
    const layers = [wmts({ name: 'B', zIndex: 2 }), wmts({ name: 'A' })];
    sortMapLayers(layers);
    expect(layers.map((l) => l.name)).toEqual(['B', 'A']);
  });
});

describe('normalizeMapLayer', () => {
  it('lässt keine leeren Felder in Firestore', () => {
    const result = normalizeMapLayer({
      name: ' Test ',
      overlayType: 'WMTS',
      url: ' https://a.org/{z}/{x}/{y}.png ',
      beschreibung: '',
      bounds: '',
      attribution: '',
    });
    expect(result).toEqual({
      name: 'Test',
      overlayType: 'WMTS',
      url: 'https://a.org/{z}/{x}/{y}.png',
      opacity: 1,
      transparent: true,
      enabled: false,
    });
  });

  it('maskiert die Attribution', () => {
    expect(
      normalizeMapLayer({ ...wms(), attribution: '<b>Land</b>' }).attribution
    ).toBe('Land');
  });

  it('setzt bei WMS ein Format vor', () => {
    expect(normalizeMapLayer(wms()).format).toBe('image/png');
  });

  it('führt bei Kachel-Ebenen keine WMS-Felder mit', () => {
    const result = normalizeMapLayer(wmts({ wmsLayers: '1' }));
    expect(result.wmsLayers).toBeUndefined();
    expect(result.format).toBeUndefined();
  });

  it('begrenzt die Deckkraft', () => {
    expect(normalizeMapLayer(wms({ opacity: 42 })).opacity).toBe(1);
  });

  it('behandelt einen unbekannten Typ als Kachel-Ebene', () => {
    expect(
      normalizeMapLayer({ name: 'x', url: 'https://a.org/{z}/{x}/{y}.png' })
        .overlayType
    ).toBe('WMTS');
  });
});
