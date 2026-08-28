import { describe, expect, it } from 'vitest';
import { isLagekarteFile, parseLagekarteFile } from './fromLagekarte';

const minimal = {
  type: 'FeatureCollection',
  name: 'map',
  view: ['47.9467', '16.846'],
  zoom: 18,
  groups: [{ name: 'eg_0', g_name: 'Gruppe 1', disabled: false }],
  notes: '',
  messages: [],
  history: [],
  colors: [],
  wmslayers: [],
  features: [
    { type: 'FeatureCollection', name: 'zeichnungen', features: [] },
    { type: 'FeatureCollection', name: 'fahrzeuge', features: [] },
    { type: 'FeatureCollection', name: 'taktischezeichen', features: [] },
  ],
};

const withZeichnungen = (features: unknown[]) => ({
  ...minimal,
  features: [{ type: 'FeatureCollection', name: 'zeichnungen', features }],
});

const withTaktischeZeichen = (features: unknown[]) => ({
  ...minimal,
  features: [{ type: 'FeatureCollection', name: 'taktischezeichen', features }],
});

describe('isLagekarteFile', () => {
  it('erkennt eine Lagekarte-Datei', () => {
    expect(isLagekarteFile(minimal)).toBe(true);
  });

  it('erkennt eine Lagekarte ohne Gruppen und ohne Elemente', () => {
    // Ein Export, dessen einziger Inhalt eigene Kartenebenen sind. Ohne diese
    // Erkennung liefe die Datei im Import in den CSV-Zweig.
    expect(
      isLagekarteFile({
        ...minimal,
        groups: [],
        features: [],
        wmslayers: [
          {
            url: 'https://inspire.lfrz.gv.at/000801/ows?SERVICE=WMS&',
            layer: 'Hochwasserrisikogebiete HQ100',
            name: 'Hochwasserrisikogebiete HQ100',
            bounds: '8.468,45.501,19.638,49.713',
            disabled: true,
          },
        ],
      }),
    ).toBe(true);
  });

  it('erkennt ein gewöhnliches GeoJSON nicht als Lagekarte-Datei', () => {
    expect(
      isLagekarteFile({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates: [16.8, 47.9] },
          },
        ],
      }),
    ).toBe(false);
  });

  it('lehnt Nicht-Objekte ab', () => {
    expect(isLagekarteFile(null)).toBe(false);
    expect(isLagekarteFile('map')).toBe(false);
  });
});

describe('parseLagekarteFile', () => {
  it('legt je Gruppe eine Ebene an, plus eine Sammelebene', () => {
    const result = parseLagekarteFile(minimal, 'Import lagekarte 27.08. 20:15');
    expect(result.layers.map((l) => l.name)).toEqual([
      'Gruppe 1',
      'Import lagekarte 27.08. 20:15',
    ]);
    expect(result.layers.every((l) => l.type === 'layer')).toBe(true);
  });

  it('übernimmt eine ausgeschaltete Gruppe als unsichtbare Ebene', () => {
    const result = parseLagekarteFile(
      {
        ...minimal,
        groups: [{ name: 'eg_0', g_name: 'Aus', disabled: true }],
      },
      'Sammelebene',
    );
    expect(
      (result.layers[0] as { defaultVisible?: string }).defaultVisible,
    ).toBe('false');
  });

  it('ordnet ein Feature mit options.g der passenden Ebene zu', () => {
    const result = parseLagekarteFile(
      withZeichnungen([
        {
          type: 'Feature',
          properties: {
            type: 'polyline',
            options: { color: 'rgb(0, 0, 255)', g: ['eg_0'] },
          },
          geometry: {
            type: 'LineString',
            coordinates: [
              [16.8, 47.9],
              [16.81, 47.91],
            ],
          },
        },
      ]),
      'Sammelebene',
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0].layerIndex).toBe(0);
    expect(result.items[0].item.type).toBe('line');
    expect((result.items[0].item as { positions?: string }).positions).toBe(
      '[[47.9,16.8],[47.91,16.81]]',
    );
  });

  it('ordnet ein Feature ohne options.g der Sammelebene zu', () => {
    const result = parseLagekarteFile(
      withZeichnungen([
        {
          type: 'Feature',
          properties: { type: 'circle', options: { radius: '30.7' } },
          geometry: { type: 'Point', coordinates: [16.8, 47.9] },
        },
      ]),
      'Sammelebene',
    );
    expect(result.items[0].layerIndex).toBe(1);
    expect(result.items[0].item.type).toBe('circle');
    expect((result.items[0].item as { radius?: number }).radius).toBeCloseTo(
      30.7,
      1,
    );
  });

  it('liest ein rectangle als Fläche mit offenem Ring', () => {
    const result = parseLagekarteFile(
      withZeichnungen([
        {
          type: 'Feature',
          properties: { type: 'rectangle', options: {} },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [16.8, 47.9],
                [16.81, 47.9],
                [16.81, 47.91],
                [16.8, 47.91],
                [16.8, 47.9],
              ],
            ],
          },
        },
      ]),
      'Sammelebene',
    );
    expect(result.items[0].item.type).toBe('area');
    expect(
      JSON.parse(
        (result.items[0].item as unknown as { positions: string }).positions,
      ),
    ).toHaveLength(4);
  });

  it('überspringt die Kupplungsmarker einer Schlauchleitung', () => {
    const result = parseLagekarteFile(
      withZeichnungen([
        {
          type: 'FeatureCollection',
          properties: { options: {} },
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: { type: 'Point', coordinates: [16.8, 47.9] },
            },
          ],
        },
        {
          type: 'Feature',
          properties: {
            type: 'polyline',
            options: { lineType: 'B-Line', offset: 20, distanceMarkers: true },
          },
          geometry: {
            type: 'LineString',
            coordinates: [
              [16.8, 47.9],
              [16.81, 47.91],
            ],
          },
        },
      ]),
      'Sammelebene',
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0].item.type).toBe('connection');
    expect((result.items[0].item as { dimension?: string }).dimension).toBe('B');
    expect(
      (result.items[0].item as { oneHozeLength?: number }).oneHozeLength,
    ).toBe(20);
  });

  it('nimmt bei vorhandenem ffnd-Block das Item unverändert', () => {
    const original = {
      id: 'a',
      layer: 'alte-ebene',
      creator: 'wer@anders.at',
      source: 'mcp',
      type: 'connection',
      name: 'Zubringleitung',
      dimension: 'B',
      foerderMenge: 800,
      positions: '[[47.9,16.8],[47.91,16.81]]',
    };
    const result = parseLagekarteFile(
      withZeichnungen([
        {
          type: 'Feature',
          properties: { type: 'polyline', options: {}, ffnd: { v: 1, item: original } },
          geometry: {
            type: 'LineString',
            coordinates: [
              [16.8, 47.9],
              [16.81, 47.91],
            ],
          },
        },
      ]),
      'Sammelebene',
    );
    expect(result.items[0].item).toMatchObject({
      name: 'Zubringleitung',
      foerderMenge: 800,
    });
    expect(result.items[0].item.id).toBeUndefined();
    expect(result.items[0].item.layer).toBeUndefined();
    expect(
      (result.items[0].item as { creator?: string; source?: string }).creator,
    ).toBeUndefined();
    expect(
      (result.items[0].item as { source?: string }).source,
    ).toBeUndefined();
  });

  it('führt ein bekanntes Symbol auf unseren Typ zurück', () => {
    const result = parseLagekarteFile(
      withTaktischeZeichen([
        {
          type: 'Feature',
          properties: {
            type: 'marker',
            options: {
              iconMarker: true,
              icon: { options: { iconUrl: '../src/img/oenorm/9.3_gefahr_brand.svg' } },
            },
            infoData: { bezeichnung: '9.3 Gefahr Brand' },
          },
          geometry: { type: 'Point', coordinates: [16.8, 47.9] },
        },
      ]),
      'Sammelebene',
    );
    expect(result.items[0].item).toMatchObject({
      type: 'marker',
      zeichen: 'Brandgefahr',
      name: '9.3 Gefahr Brand',
    });
  });

  it('macht aus einem unbekannten Symbol einen marker mit absoluter iconUrl', () => {
    const result = parseLagekarteFile(
      withTaktischeZeichen([
        {
          type: 'Feature',
          properties: {
            type: 'marker',
            options: {
              iconMarker: true,
              icon: { options: { iconUrl: '../src/img/babs/irgendwas.svg' } },
            },
            infoData: { bezeichnung: 'Schweizer Zeichen' },
          },
          geometry: { type: 'Point', coordinates: [16.8, 47.9] },
        },
      ]),
      'Sammelebene',
    );
    expect(result.items[0].item).toMatchObject({
      type: 'marker',
      name: 'Schweizer Zeichen',
      iconUrl: 'https://www.lagekarte.info/src/img/babs/irgendwas.svg',
    });
  });

  it('macht aus messages Tagebucheinträge', () => {
    const result = parseLagekarteFile(
      {
        ...minimal,
        messages: [
          {
            id: 1,
            date: '2026-08-27T18:27:42.647Z',
            text: 'Nachricht 1',
            textorg: 'Nachricht 1',
            coords: [],
          },
        ],
      },
      'Sammelebene',
    );
    expect(result.diaries).toHaveLength(1);
    expect(result.diaries[0]).toMatchObject({
      type: 'diary',
      name: 'Nachricht 1',
      datum: '2026-08-27T18:27:42.647Z',
    });
  });

  it('warnt bei einem Feature ohne verwertbare Geometrie statt zu werfen', () => {
    const result = parseLagekarteFile(
      withZeichnungen([
        { type: 'Feature', properties: { type: 'polyline' }, geometry: null },
      ]),
      'Sammelebene',
    );
    expect(result.items).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('zeichnungen');
  });

  it('wirft bei fehlendem FeatureCollection-Typ', () => {
    expect(() => parseLagekarteFile({ type: 'Feature' }, 'Sammelebene')).toThrow();
  });

  it('lässt eine Ebene ohne Features weg', () => {
    const result = parseLagekarteFile(minimal, 'Sammelebene');
    const used = new Set(result.items.map((i) => i.layerIndex));
    expect(used.size).toBe(0);
  });
});
