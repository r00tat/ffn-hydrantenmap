import { describe, expect, it } from 'vitest';
import { isCouplingCollection } from './couplingMarkers';
import {
  buildFahrzeugeGroup,
  buildLagekarteFile,
  buildTaktischeZeichenGroup,
  buildZeichnungenGroup,
  readableExtras,
} from './toLagekarte';
import type { LagekarteFeature } from './types';

const featuresOnly = (group: ReturnType<typeof buildZeichnungenGroup>) =>
  group.features.filter((f) => !isCouplingCollection(f)) as LagekarteFeature[];

describe('buildZeichnungenGroup', () => {
  it('schreibt eine Leitung als polyline mit lineType und Kupplungsmarkern davor', () => {
    const group = buildZeichnungenGroup(
      [
        {
          id: 'a',
          type: 'connection',
          name: 'Zubringleitung',
          dimension: 'B',
          oneHozeLength: 20,
          positions: '[[47.9,16.8],[47.902,16.8]]',
          color: 'blue',
        } as never,
      ],
      {},
      {},
    );

    expect(isCouplingCollection(group.features[0])).toBe(true);
    const line = group.features[1] as LagekarteFeature;
    expect(line.properties.type).toBe('polyline');
    expect(line.properties.options?.lineType).toBe('B-Line');
    expect(line.properties.options?.offset).toBe(20);
    expect(line.properties.options?.distanceMarkers).toBe(true);
    expect(line.geometry?.type).toBe('LineString');
    expect(line.geometry?.coordinates).toEqual([
      [16.8, 47.9],
      [16.8, 47.902],
    ]);
    expect(line.properties.ffnd?.item.id).toBe('a');
  });

  it('schreibt eine Leitung ohne bekannten Schlauchtyp ohne Kupplungsmarker', () => {
    const group = buildZeichnungenGroup(
      [
        {
          id: 'a',
          type: 'connection',
          name: 'D-Leitung',
          dimension: 'D',
          positions: '[[47.9,16.8],[47.902,16.8]]',
        } as never,
      ],
      {},
      {},
    );
    expect(group.features).toHaveLength(1);
    expect(
      (group.features[0] as LagekarteFeature).properties.options?.lineType,
    ).toBeUndefined();
  });

  it('markiert eine Dammlinie gestrichelt', () => {
    const [line] = featuresOnly(
      buildZeichnungenGroup(
        [
          {
            id: 'l',
            type: 'line',
            name: 'Damm',
            dammbau: 'true',
            positions: '[[47.9,16.8],[47.901,16.801]]',
          } as never,
        ],
        {},
        {},
      ),
    );
    expect(line.properties.options?.dashArray).toEqual([5, 5]);
  });

  it('schließt den Ring einer Fläche', () => {
    const [area] = featuresOnly(
      buildZeichnungenGroup(
        [
          {
            id: 'f',
            type: 'area',
            name: 'Absperrung',
            positions: '[[47.9,16.8],[47.9,16.81],[47.91,16.81]]',
            opacity: 50,
          } as never,
        ],
        {},
        {},
      ),
    );
    expect(area.properties.type).toBe('polygon');
    expect(area.geometry?.type).toBe('Polygon');
    expect(area.geometry?.coordinates).toEqual([
      [
        [16.8, 47.9],
        [16.81, 47.9],
        [16.81, 47.91],
        [16.8, 47.9],
      ],
    ]);
  });

  it('schreibt den Kreisradius als String', () => {
    const [circle] = featuresOnly(
      buildZeichnungenGroup(
        [
          {
            id: 'c',
            type: 'circle',
            name: 'Gefahrenbereich',
            lat: 47.9,
            lng: 16.8,
            radius: 50,
          } as never,
        ],
        {},
        {},
      ),
    );
    expect(circle.properties.type).toBe('circle');
    expect(circle.properties.options?.radius).toBe('50');
    expect(circle.geometry?.coordinates).toEqual([16.8, 47.9]);
  });

  it('schreibt je Stroke einer Zeichnung eine polyline', () => {
    const group = buildZeichnungenGroup(
      [{ id: 'd', type: 'drawing', name: 'Skizze' } as never],
      {
        d: [
          {
            color: '#ff0000',
            width: 4,
            points: [
              [47.9, 16.8],
              [47.901, 16.801],
            ],
            order: 0,
          },
          {
            color: '#00ff00',
            width: 2,
            points: [
              [47.902, 16.802],
              [47.903, 16.803],
            ],
            order: 1,
          },
        ],
      },
      {},
    );
    const lines = featuresOnly(group);
    expect(lines).toHaveLength(2);
    expect(lines[0].properties.options?.color).toBe('#ff0000');
    expect(lines[0].properties.options?.weight).toBe(4);
    expect(lines[1].properties.options?.weight).toBe(2);
    // Die Strokes hängen nur am ersten Teilstück
    expect(lines[0].properties.ffnd?.strokes).toHaveLength(2);
    expect(lines[1].properties.ffnd?.strokes).toBeUndefined();
  });

  it('schreibt je Wasserstands-Band eine Fläche', () => {
    const group = buildZeichnungenGroup(
      [
        {
          id: 'w',
          type: 'wasserstand',
          name: 'HQ100',
          wasserBaender: JSON.stringify({
            baender: [{ tiefeM: 0, ringe: ['_c`|@_wo}@_ibE????~hbE'] }],
          }),
        } as never,
      ],
      {},
      {},
    );
    const flaechen = featuresOnly(group);
    expect(flaechen).toHaveLength(1);
    expect(flaechen[0].properties.type).toBe('polygon');
    expect(flaechen[0].properties.infoData?.bezeichnung).toBe('HQ100 (0 m)');
  });

  it('trägt die Gruppenzuordnung aus der Ebene ein', () => {
    const [line] = featuresOnly(
      buildZeichnungenGroup(
        [
          {
            id: 'l',
            type: 'line',
            name: 'Linie',
            layer: 'layer-1',
            positions: '[[47.9,16.8],[47.901,16.801]]',
          } as never,
        ],
        {},
        { 'layer-1': 'eg_0' },
      ),
    );
    expect(line.properties.options?.g).toEqual(['eg_0']);
  });

  it('überspringt Elemente ohne verwertbare Geometrie', () => {
    const group = buildZeichnungenGroup(
      [{ id: 'l', type: 'line', name: 'kaputt', positions: 'nicht json' } as never],
      {},
      {},
    );
    expect(group.features).toEqual([]);
  });
});

describe('buildFahrzeugeGroup', () => {
  it('schreibt ein Fahrzeug mit Label, Bezeichnung und Besatzung', () => {
    const group = buildFahrzeugeGroup(
      [
        {
          id: 'v',
          type: 'vehicle',
          name: 'KDO Neusiedl',
          fw: 'FF Neusiedl',
          besatzung: '1:5',
          lat: 47.9,
          lng: 16.8,
          beschreibung: 'Erstangriff',
        } as never,
      ],
      {},
    );
    expect(group.name).toBe('fahrzeuge');
    const f = group.features[0];
    expect(f.properties.type).toBe('marker');
    expect(f.properties.options?.iconMarker).toBe(true);
    expect(f.properties.options?.icon?.options?.type).toBe('fahrzeug');
    expect(f.properties.options?.icon?.options?.iconUrl).toContain(
      '5.01.01_grundzeichen',
    );
    expect(f.properties.infoData?.label).toBe('KDO Neusiedl');
    expect(f.properties.infoData?.mannschaftAnz).toBe('1:5');
    expect(f.properties.infoData?.informationen).toContain('Erstangriff');
    expect(f.properties.ffnd?.item.id).toBe('v');
  });

  it('überspringt Fahrzeuge ohne Position', () => {
    expect(
      buildFahrzeugeGroup([{ id: 'v', type: 'vehicle', name: 'X' } as never], {})
        .features,
    ).toEqual([]);
  });
});

describe('buildTaktischeZeichenGroup', () => {
  it('schreibt ein taktisches Zeichen mit ÖNORM-Symbol', () => {
    const group = buildTaktischeZeichenGroup(
      [
        {
          id: 'm',
          type: 'marker',
          name: 'Brand',
          zeichen: 'Brandgefahr',
          lat: 47.9,
          lng: 16.8,
        } as never,
      ],
      {},
      undefined,
    );
    const f = group.features[0];
    expect(f.properties.options?.icon?.options?.iconUrl).toContain(
      '9.3_gefahr_brand.svg',
    );
    expect(f.properties.options?.icon?.options?.type).toBe('taktischezeichen');
  });

  it('nutzt bei unbekanntem Zeichen die eigene iconUrl', () => {
    const group = buildTaktischeZeichenGroup(
      [
        {
          id: 'm',
          type: 'marker',
          name: 'Eigenes',
          iconUrl: 'https://hydranten.ffnd.at/icons/risiko.svg',
          lat: 47.9,
          lng: 16.8,
        } as never,
      ],
      {},
      undefined,
    );
    expect(group.features[0].properties.options?.icon?.options?.iconUrl).toBe(
      'https://hydranten.ffnd.at/icons/risiko.svg',
    );
  });

  it('schreibt ein Rohr mit dem Geräte-Symbol', () => {
    const group = buildTaktischeZeichenGroup(
      [{ id: 'r', type: 'rohr', name: 'C-Rohr', art: 'C', lat: 47.9, lng: 16.8 } as never],
      {},
      undefined,
    );
    expect(group.features[0].properties.options?.icon?.options?.iconUrl).toContain(
      'strahlrohr.svg',
    );
    expect(group.features[0].properties.options?.icon?.options?.type).toBe(
      'geraete',
    );
  });

  it('hängt die GIS-Daten mit eigener Gruppenzuordnung an', () => {
    const group = buildTaktischeZeichenGroup([], {}, {
      gis: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [16.8, 47.9] },
            properties: {
              id: 'h1',
              description: 'Hydrant 12',
              icon: { iconUrl: 'https://hydranten.ffnd.at/icons/hydrant.png' },
            },
          },
        ],
      },
      groupName: 'eg_9',
    });
    expect(group.features).toHaveLength(1);
    expect(group.features[0].properties.options?.g).toEqual(['eg_9']);
    expect(group.features[0].properties.infoData?.bezeichnung).toBe('Hydrant 12');
    expect(group.features[0].properties.ffnd).toBeUndefined();
  });

  it('überspringt GIS-Features ohne Punktgeometrie', () => {
    const group = buildTaktischeZeichenGroup([], {}, {
      gis: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [16.8, 47.9],
                [16.81, 47.9],
              ],
            },
            properties: { id: 'x' },
          },
        ],
      },
      groupName: 'eg_9',
    });
    expect(group.features).toEqual([]);
  });
});

describe('readableExtras', () => {
  it('fasst die Förderkennzahlen lesbar zusammen', () => {
    expect(
      readableExtras({
        type: 'connection',
        name: 'Zubringleitung',
        foerderMenge: 800,
        zielDruck: 5,
        pumpenAusgangsdruck: 8,
      } as never),
    ).toContain('800');
  });

  it('fasst die Dammplanung lesbar zusammen', () => {
    const text = readableExtras({
      type: 'line',
      name: 'Damm',
      dammbau: 'true',
      dammHoehe: 0.8,
      freibord: 0.3,
      dammBauweise: 'pyramide',
    } as never);
    expect(text).toContain('0,8');
    expect(text).toContain('Pyramidenstapel');
  });

  it('nimmt fieldData mit auf', () => {
    expect(
      readableExtras({
        type: 'marker',
        name: 'X',
        fieldData: { Zustand: 'trocken' },
      } as never),
    ).toBe('Zustand: trocken');
  });

  it('gibt für ein Element ohne Zusatzdaten einen leeren String zurück', () => {
    expect(readableExtras({ type: 'marker', name: 'X' } as never)).toBe('');
  });
});

const baseSource = {
  firecall: { id: 'fc', name: 'Brand Hauptstraße', lat: 47.9467, lng: 16.846 },
  items: [] as never[],
  layers: [] as never[],
  strokes: {},
};

describe('buildLagekarteFile', () => {
  it('setzt Kopfdaten aus dem Einsatz', () => {
    const file = buildLagekarteFile(baseSource as never);
    expect(file.type).toBe('FeatureCollection');
    expect(file.name).toBe('Brand Hauptstraße');
    expect(file.view).toEqual(['47.946700', '16.846000']);
    expect(file.zoom).toBe(17);
    expect(file.colors).toEqual([]);
    expect(file.wmslayers).toEqual([]);
  });

  it('legt für jede Ebene eine Gruppe an', () => {
    const file = buildLagekarteFile({
      ...baseSource,
      layers: [
        { id: 'l1', name: 'Erstangriff', type: 'layer' },
        { id: 'l2', name: 'Zubringung', type: 'layer', defaultVisible: 'false' },
      ],
    } as never);
    expect(file.groups).toEqual([
      { name: 'eg_0', g_name: 'Erstangriff', disabled: false },
      { name: 'eg_1', g_name: 'Zubringung', disabled: true },
    ]);
  });

  it('legt für die GIS-Daten eine zusätzliche Gruppe an', () => {
    const file = buildLagekarteFile({
      ...baseSource,
      gis: { type: 'FeatureCollection', features: [] },
    } as never);
    expect(file.groups.at(-1)?.g_name).toBe('GIS-Daten');
  });

  it('schreibt Tagebuch und Geschäftsbuch als messages', () => {
    const file = buildLagekarteFile({
      ...baseSource,
      items: [
        {
          id: 'd1',
          type: 'diary',
          name: 'Erkundung abgeschlossen',
          datum: '2026-08-27T18:00:00.000Z',
        },
        {
          id: 'g1',
          type: 'gb',
          name: 'Nachforderung Drehleiter',
          datum: '2026-08-27T18:05:00.000Z',
        },
      ],
    } as never);
    expect(file.messages).toHaveLength(2);
    expect(file.messages[0]).toEqual({
      id: 1,
      date: '2026-08-27T18:00:00.000Z',
      text: 'Erkundung abgeschlossen',
      textorg: 'Erkundung abgeschlossen',
      coords: [],
    });
    expect(file.messages[1].id).toBe(2);
  });

  it('schreibt das Tagebuch zusätzlich als notes', () => {
    const file = buildLagekarteFile({
      ...baseSource,
      items: [
        {
          id: 'd1',
          type: 'diary',
          name: 'Erkundung',
          datum: '2026-08-27T18:00:00.000Z',
        },
      ],
    } as never);
    expect(file.notes).toContain('Erkundung');
  });

  it('schreibt genau die drei belegten Untergruppen', () => {
    const file = buildLagekarteFile(baseSource as never);
    expect(file.features.map((g) => g.name)).toEqual([
      'zeichnungen',
      'fahrzeuge',
      'taktischezeichen',
    ]);
  });

  it('schreibt genau einen history-Eintrag mit dem aktuellen Stand', () => {
    const file = buildLagekarteFile(baseSource as never);
    expect(file.history).toHaveLength(1);
    expect(file.history[0].sp.data.features).toEqual(file.features);
    expect(file.history[0].timestamp).toBe(file.history[0].sp.timestamp);
  });

  it('nutzt die Position des ersten Items, wenn der Einsatz keine hat', () => {
    const file = buildLagekarteFile({
      ...baseSource,
      firecall: { id: 'fc', name: 'Ohne Position' },
      items: [{ id: 'm', type: 'marker', name: 'X', lat: 48.1, lng: 16.3 }],
    } as never);
    expect(file.view).toEqual(['48.100000', '16.300000']);
  });
});
