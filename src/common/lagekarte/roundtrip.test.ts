import { describe, expect, it } from 'vitest';
import { isLagekarteFile, parseLagekarteFile } from './fromLagekarte';
import raw from './fixtures/lagekarte-export.json';
import wmsRaw from './fixtures/lagekarte-wmslayers.json';
import { buildLagekarteFile } from './toLagekarte';
import type { LagekarteSource } from './types';

/**
 * Die eigentliche Absicherung: ein echter Export aus lagekarte.info.
 *
 * lagekarte.info ist closed source, es gibt keine Formatspezifikation — dieser
 * Test ist die Spezifikation. Die Datei liegt bewusst hier und nicht in
 * `captures/`: dieses Verzeichnis ist gitignored, der Test würde sonst nur auf
 * genau diesem Rechner laufen.
 *
 * Der zweite Referenz-Export ist byteweise identisch bis auf `messages` (dort
 * leer). Was er zusätzlich prüfen würde, deckt `fromLagekarte.test.ts` ab.
 */
describe('Roundtrip mit einem echten lagekarte.info-Export', () => {
  it('wird als Lagekarte-Datei erkannt', () => {
    expect(isLagekarteFile(raw)).toBe(true);
  });

  it('liest alle Elemente ohne Warnung', () => {
    const result = parseLagekarteFile(raw, 'Sammelebene');
    expect(result.warnings).toEqual([]);
    // 10 zeichnungen minus 2 Kupplungssammlungen + 4 Fahrzeuge + 7 taktische Zeichen
    expect(result.items).toHaveLength(19);
  });

  it('legt die Gruppe als eigene Ebene an, plus die Sammelebene', () => {
    const result = parseLagekarteFile(raw, 'Sammelebene');
    expect(result.layers.map((l) => l.name)).toEqual(['Gruppe 1', 'Sammelebene']);
  });

  it('erkennt die beiden Schlauchleitungen als connection', () => {
    const result = parseLagekarteFile(raw, 'Sammelebene');
    const connections = result.items.filter((i) => i.item.type === 'connection');
    expect(connections).toHaveLength(2);
    expect(
      connections.map((c) => (c.item as { dimension?: string }).dimension).sort(),
    ).toEqual(['B', 'C']);
  });

  it('erkennt Hydrant, Strahlrohr, Atemschutzsammelplatz und die Fahrzeuge', () => {
    const result = parseLagekarteFile(raw, 'Sammelebene');
    const types = result.items.map((i) => i.item.type);
    expect(types).toContain('hydrant');
    expect(types).toContain('rohr');
    expect(types).toContain('assp');
    // drei oebfv-5.01-Symbole plus eine Drehleiter aus dem fahrzeuge-Ordner
    expect(types.filter((t) => t === 'vehicle')).toHaveLength(4);
  });

  it('macht aus den Nachrichten Tagebucheinträge', () => {
    const result = parseLagekarteFile(raw, 'Sammelebene');
    expect(result.diaries).toHaveLength(3);
    expect(result.diaries[0].name).toBe('Nachricht 1');
  });

  it('ist über build → parse stabil', () => {
    const first = parseLagekarteFile(raw, 'Sammelebene');

    const source: LagekarteSource = {
      firecall: { name: 'Roundtrip', lat: 47.946697, lng: 16.846043 },
      items: first.items.map(({ item, layerIndex }, index) => ({
        ...item,
        id: `i${index}`,
        layer: `l${layerIndex}`,
      })),
      layers: first.layers.map((layer, index) => ({
        ...layer,
        id: `l${index}`,
      })) as never,
      strokes: {},
    };

    const built = buildLagekarteFile(source);
    expect(isLagekarteFile(built)).toBe(true);

    const second = parseLagekarteFile(built, 'Sammelebene');
    expect(second.warnings).toEqual([]);
    expect(second.items).toHaveLength(first.items.length);
    expect(second.items.map((i) => i.item.type).sort()).toEqual(
      first.items.map((i) => i.item.type).sort(),
    );
  });

  it('erhält beim Roundtrip über den ffnd-Block die Kennzahlen', () => {
    const source: LagekarteSource = {
      firecall: { name: 'Förderung', lat: 47.9, lng: 16.8 },
      items: [
        {
          id: 'c1',
          type: 'connection',
          name: 'Zubringleitung',
          dimension: 'B',
          oneHozeLength: 20,
          layer: 'l0',
          positions: '[[47.9,16.8],[47.902,16.8]]',
          foerderMenge: 800,
          zielDruck: 5,
          hoehenunterschied: 12,
        } as never,
      ],
      layers: [{ id: 'l0', type: 'layer', name: 'Zubringung' } as never],
      strokes: {},
    };

    const built = buildLagekarteFile(source);
    const back = parseLagekarteFile(built, 'Sammelebene');
    expect(back.items[0].item).toMatchObject({
      type: 'connection',
      name: 'Zubringleitung',
      foerderMenge: 800,
      zielDruck: 5,
      hoehenunterschied: 12,
    });
  });

  it('ordnet die importierten Elemente beim Export wieder ihren Gruppen zu', () => {
    const first = parseLagekarteFile(raw, 'Sammelebene');
    const source: LagekarteSource = {
      firecall: { name: 'Roundtrip', lat: 47.9, lng: 16.8 },
      items: first.items.map(({ item, layerIndex }, index) => ({
        ...item,
        id: `i${index}`,
        layer: `l${layerIndex}`,
      })),
      layers: first.layers.map((layer, index) => ({
        ...layer,
        id: `l${index}`,
      })) as never,
      strokes: {},
    };

    const built = buildLagekarteFile(source);
    expect(built.groups.map((g) => g.g_name)).toEqual(['Gruppe 1', 'Sammelebene']);

    const second = parseLagekarteFile(built, 'Neue Sammelebene');
    // Jedes Element muss in derselben Ebene landen wie beim ersten Lesen
    expect(second.items.map((i) => i.layerIndex)).toEqual(
      first.items.map((i) => i.layerIndex),
    );
  });
});

/**
 * Der zweite Referenz-Export: eine Lagekarte, deren einziger Inhalt drei
 * WMS-Ebenen sind. Er belegt das Schema von `wmslayers`, das vorher in keinem
 * Sample stand — insbesondere die Reihenfolge in `bounds`.
 */
describe('WMS-Ebenen aus einem echten lagekarte.info-Export', () => {
  it('wird als Lagekarte-Datei erkannt', () => {
    expect(isLagekarteFile(wmsRaw)).toBe(true);
  });

  it('liest alle drei Ebenen ohne Warnung', () => {
    const result = parseLagekarteFile(wmsRaw, 'Sammelebene');
    expect(result.warnings).toEqual([]);
    expect(result.mapLayers.map((l) => l.name)).toEqual([
      'Hochwasserrisikogebiete HQ100',
      'Hochwasserüberflutungsflächen HQ100',
      'Isotopenniederschlagsmessstellen',
    ]);
  });

  it('dreht die Ausdehnung in unsere Reihenfolge', () => {
    // In der Datei steht `8.468,45.501,19.638,49.713` — west,süd,ost,nord.
    // Als Leaflet-Rechteck gelesen läge die Ebene im Indischen Ozean.
    const result = parseLagekarteFile(wmsRaw, 'Sammelebene');
    expect(result.mapLayers[0].bounds).toBe('45.501,8.468,49.713,19.638');
  });

  it('übernimmt disabled als ausgeschaltet', () => {
    const result = parseLagekarteFile(wmsRaw, 'Sammelebene');
    expect(result.mapLayers.every((l) => l.enabled === false)).toBe(true);
  });

  it('schreibt die Ebenen wieder so hinaus, wie sie hereinkamen', () => {
    const first = parseLagekarteFile(wmsRaw, 'Sammelebene');
    const built = buildLagekarteFile({
      firecall: { name: 'Roundtrip', lat: 47.9, lng: 16.8 },
      items: [],
      layers: [],
      mapLayers: first.mapLayers,
      strokes: {},
    });

    expect(built.wmslayers).toEqual(wmsRaw.wmslayers);
  });

  it('erhält über den ffnd-Block auch das, was lagekarte nicht kennt', () => {
    const built = buildLagekarteFile({
      firecall: { name: 'Roundtrip', lat: 47.9, lng: 16.8 },
      items: [],
      layers: [],
      mapLayers: [
        {
          id: 'a',
          name: 'Orthofoto',
          overlayType: 'WMS',
          url: 'https://gis.example.at/wms?',
          wmsLayers: '1',
          format: 'image/jpeg',
          transparent: false,
          opacity: 0.35,
          maxNativeZoom: 18,
          zIndex: 7,
          enabled: true,
        },
        {
          name: 'Kacheln',
          overlayType: 'WMTS',
          url: 'https://a.org/{z}/{x}/{y}.png',
          opacity: 1,
        },
      ],
      strokes: {},
    });

    // lagekarte bekommt nur die WMS-Ebene, und nur die Felder, die es kennt.
    expect(built.wmslayers).toHaveLength(1);
    expect(built.ffnd?.mapLayers).toHaveLength(2);

    const back = parseLagekarteFile(built, 'Sammelebene');
    expect(back.warnings).toEqual([]);
    expect(back.mapLayers).toHaveLength(2);
    expect(back.mapLayers[0]).toMatchObject({
      name: 'Orthofoto',
      opacity: 0.35,
      format: 'image/jpeg',
      transparent: false,
      maxNativeZoom: 18,
      zIndex: 7,
    });
    // Die Kachel-Ebene überlebt nur über den eigenen Block.
    expect(back.mapLayers[1]).toMatchObject({
      overlayType: 'WMTS',
      url: 'https://a.org/{z}/{x}/{y}.png',
    });
    expect(back.mapLayers[0].id).toBeUndefined();
  });

  it('schreibt keinen ffnd-Block, wenn es keine Kartenebenen gibt', () => {
    const built = buildLagekarteFile({
      firecall: { name: 'Leer', lat: 47.9, lng: 16.8 },
      items: [],
      layers: [],
      strokes: {},
    });
    expect(built.wmslayers).toEqual([]);
    expect(built.ffnd).toBeUndefined();
  });
});
