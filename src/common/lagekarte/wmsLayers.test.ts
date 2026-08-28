import { describe, expect, it } from 'vitest';
import type { FirecallMapLayer } from '../mapLayers';
import {
  boundsFromLagekarte,
  boundsToLagekarte,
  mapLayersFromLagekarte,
  mapLayersFromWmsLayers,
  toLagekarteWmsLayers,
} from './wmsLayers';

const wms = (overrides: Partial<FirecallMapLayer> = {}): FirecallMapLayer => ({
  id: 'a',
  name: 'Orthofoto Burgenland',
  overlayType: 'WMS',
  url: 'https://gis.example.at/wms?',
  wmsLayers: '1',
  format: 'image/png',
  transparent: true,
  opacity: 0.6,
  bounds: '46.82,15.98,48.16,17.17',
  enabled: true,
  ...overrides,
});

/** Der Eintrag aus `captures/lagekarte (3).json`, wörtlich. */
const sampleEntry = {
  url: 'https://inspire.lfrz.gv.at/000801/ows?SERVICE=WMS&',
  layer: 'Hochwasserrisikogebiete HQ100',
  name: 'Hochwasserrisikogebiete HQ100',
  bounds: '8.468,45.501,19.638,49.713',
  disabled: true,
};

describe('bounds-Reihenfolge', () => {
  // lagekarte schreibt west,süd,ost,nord; wir süd,west,nord,ost. Falsch herum
  // gelesen läge das Beispiel unten irgendwo im Indischen Ozean.
  it('dreht beim Schreiben auf die Reihenfolge von lagekarte', () => {
    expect(boundsToLagekarte('46.82,15.98,48.16,17.17')).toBe(
      '15.98,46.82,17.17,48.16'
    );
  });

  it('dreht beim Lesen zurück', () => {
    expect(boundsFromLagekarte('8.468,45.501,19.638,49.713')).toBe(
      '45.501,8.468,49.713,19.638'
    );
  });

  it('ist in beide Richtungen verlustfrei', () => {
    const original = '46.82,15.98,48.16,17.17';
    expect(boundsFromLagekarte(boundsToLagekarte(original))).toBe(original);
  });

  it('lässt leere und kaputte Angaben weg', () => {
    expect(boundsToLagekarte(undefined)).toBeUndefined();
    expect(boundsToLagekarte('1,2')).toBeUndefined();
    expect(boundsFromLagekarte('')).toBeUndefined();
    expect(boundsFromLagekarte('a,b,c,d')).toBeUndefined();
    // Als Leaflet-Rechteck gelesen unmöglich — Breite über 90.
    expect(boundsFromLagekarte('45.5,8.4,49.7,199')).toBeUndefined();
  });
});

describe('toLagekarteWmsLayers', () => {
  it('schreibt das beobachtete Schema', () => {
    expect(toLagekarteWmsLayers([wms({ enabled: false })])).toEqual([
      {
        url: 'https://gis.example.at/wms?',
        layer: '1',
        name: 'Orthofoto Burgenland',
        bounds: '15.98,46.82,17.17,48.16',
        disabled: true,
      },
    ]);
  });

  it('dreht die Sichtbarkeit um', () => {
    expect(toLagekarteWmsLayers([wms({ enabled: true })])[0].disabled).toBe(
      false
    );
  });

  it('lässt Kachel-Ebenen weg — dafür gibt es dort kein Feld', () => {
    const tiles = wms({
      overlayType: 'WMTS',
      url: 'https://a.org/{z}/{x}/{y}.png',
      wmsLayers: undefined,
    });
    expect(toLagekarteWmsLayers([tiles])).toEqual([]);
  });

  it('lässt gelöschte und unsichere Ebenen weg', () => {
    expect(toLagekarteWmsLayers([wms({ deleted: true })])).toEqual([]);
    expect(
      toLagekarteWmsLayers([wms({ url: 'http://gis.example.at/wms' })])
    ).toEqual([]);
  });
});

describe('mapLayersFromWmsLayers', () => {
  it('liest den Eintrag aus dem Referenz-Export', () => {
    expect(mapLayersFromWmsLayers([sampleEntry])).toEqual([
      {
        name: 'Hochwasserrisikogebiete HQ100',
        overlayType: 'WMS',
        url: 'https://inspire.lfrz.gv.at/000801/ows?SERVICE=WMS&',
        wmsLayers: 'Hochwasserrisikogebiete HQ100',
        format: 'image/png',
        transparent: true,
        opacity: 1,
        enabled: false,
        bounds: '45.501,8.468,49.713,19.638',
      },
    ]);
  });

  it('schaltet eine Ebene ohne disabled ein', () => {
    const { disabled: _d, ...enabled } = sampleEntry;
    expect(mapLayersFromWmsLayers([enabled])[0].enabled).toBe(true);
  });

  it('weist eine Ebene ohne https ab und sagt warum', () => {
    const warnings: string[] = [];
    const result = mapLayersFromWmsLayers(
      [{ ...sampleEntry, url: 'http://evil.example/wms' }],
      warnings
    );
    expect(result).toEqual([]);
    expect(warnings[0]).toContain('https');
  });

  it('weist eine Ebene ohne LAYERS ab', () => {
    const warnings: string[] = [];
    expect(
      mapLayersFromWmsLayers([{ ...sampleEntry, layer: '' }], warnings)
    ).toEqual([]);
    expect(warnings[0]).toContain('LAYERS');
  });

  it('kommt mit fehlendem oder unsinnigem Feld zurecht', () => {
    expect(mapLayersFromWmsLayers(undefined)).toEqual([]);
    expect(mapLayersFromWmsLayers('keine liste')).toEqual([]);
    expect(mapLayersFromWmsLayers([null, 42])).toEqual([]);
  });
});

describe('mapLayersFromLagekarte', () => {
  it('bevorzugt den eigenen Block — er trägt mehr', () => {
    const result = mapLayersFromLagekarte({
      wmslayers: [sampleEntry],
      ffnd: { mapLayers: [wms()] },
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Orthofoto Burgenland');
    // Deckkraft und Format kennt `wmslayers` nicht.
    expect(result[0].opacity).toBe(0.6);
    expect(result[0].format).toBe('image/png');
  });

  it('streift Identität und Herkunft ab', () => {
    const result = mapLayersFromLagekarte({
      ffnd: {
        mapLayers: [
          wms({
            id: 'alt',
            created: '2026-01-01',
            creator: 'jemand@example.at',
            updatedBy: 'wer@example.at',
          }),
        ],
      },
    });
    expect(result[0].id).toBeUndefined();
    expect(result[0].created).toBeUndefined();
    expect(result[0].creator).toBeUndefined();
    expect(result[0].updatedBy).toBeUndefined();
  });

  it('weist auch im eigenen Block eine unsichere Adresse ab', () => {
    // Eine importierte Datei ist Fremdeingabe, auch wenn sie unseren Block trägt.
    const warnings: string[] = [];
    const result = mapLayersFromLagekarte(
      { ffnd: { mapLayers: [wms({ url: 'javascript:alert(1)' })] } },
      warnings
    );
    expect(result).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  it('fällt ohne eigenen Block auf wmslayers zurück', () => {
    const result = mapLayersFromLagekarte({ wmslayers: [sampleEntry] });
    expect(result[0].wmsLayers).toBe('Hochwasserrisikogebiete HQ100');
  });

  it('liefert für eine Datei ohne beides nichts', () => {
    expect(mapLayersFromLagekarte({})).toEqual([]);
  });
});
