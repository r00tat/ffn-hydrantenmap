import { describe, expect, it } from 'vitest';
import {
  HOSE_LINE_TYPES,
  buildCouplingCollection,
  hoseOffsetFor,
  isCouplingCollection,
  lineTypeFor,
} from './couplingMarkers';

describe('lineTypeFor / hoseOffsetFor', () => {
  it('bildet B auf B-Line mit 20 m ab', () => {
    expect(lineTypeFor('B')).toBe('B-Line');
    expect(hoseOffsetFor('B')).toBe(20);
  });

  it('bildet C auf C-Line mit 15 m ab', () => {
    expect(lineTypeFor('C')).toBe('C-Line');
    expect(hoseOffsetFor('C')).toBe(15);
  });

  it('kennt nur die im Sample belegten Typen', () => {
    expect(Object.keys(HOSE_LINE_TYPES).sort()).toEqual(['B', 'C']);
    expect(lineTypeFor('D')).toBeUndefined();
  });
});

describe('buildCouplingCollection', () => {
  it('setzt Punkte im Abstand des offsets entlang der Linie', () => {
    // ~0.001° Breite ≈ 111 m → bei 20 m Abstand rund 5 Kupplungen
    const collection = buildCouplingCollection(
      [
        [47.9, 16.8],
        [47.901, 16.8],
      ],
      20,
    );
    expect(collection.type).toBe('FeatureCollection');
    expect(collection.properties).toEqual({ options: {} });
    expect(collection.features.length).toBeGreaterThanOrEqual(4);
    expect(collection.features.length).toBeLessThanOrEqual(6);
    for (const f of collection.features) {
      expect(f.properties).toEqual({});
      expect(f.geometry?.type).toBe('Point');
    }
  });

  it('setzt die Marker über einen Knick hinweg fort', () => {
    const collection = buildCouplingCollection(
      [
        [47.9, 16.8],
        [47.9005, 16.8],
        [47.9005, 16.8015],
      ],
      20,
    );
    // Erster Schenkel ~55 m, zweiter ~112 m → zusammen ~167 m, also 8 Kupplungen
    expect(collection.features.length).toBeGreaterThanOrEqual(7);
  });

  it('liefert keine Punkte für eine Linie kürzer als der offset', () => {
    expect(
      buildCouplingCollection(
        [
          [47.9, 16.8],
          [47.90001, 16.8],
        ],
        20,
      ).features,
    ).toEqual([]);
  });

  it('liefert keine Punkte bei weniger als zwei Stützpunkten', () => {
    expect(buildCouplingCollection([[47.9, 16.8]], 20).features).toEqual([]);
  });
});

describe('isCouplingCollection', () => {
  it('erkennt die namenlose Punkt-Sammlung', () => {
    expect(
      isCouplingCollection({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates: [16.8, 47.9] },
          },
        ],
        properties: { options: {} },
      } as never),
    ).toBe(true);
  });

  it('erkennt eine benannte Gruppe nicht als Kupplungssammlung', () => {
    expect(
      isCouplingCollection({
        type: 'FeatureCollection',
        name: 'zeichnungen',
        features: [],
      } as never),
    ).toBe(false);
  });

  it('erkennt ein einfaches Feature nicht als Kupplungssammlung', () => {
    expect(
      isCouplingCollection({
        type: 'Feature',
        properties: { type: 'marker' },
        geometry: { type: 'Point', coordinates: [16.8, 47.9] },
      } as never),
    ).toBe(false);
  });

  it('lehnt eine Sammlung mit nicht-Punkt-Geometrie ab', () => {
    expect(
      isCouplingCollection({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: [[16.8, 47.9]] },
          },
        ],
        properties: { options: {} },
      } as never),
    ).toBe(false);
  });

  it('lehnt eine Sammlung ab, deren Punkte eigene properties tragen', () => {
    expect(
      isCouplingCollection({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { type: 'marker' },
            geometry: { type: 'Point', coordinates: [16.8, 47.9] },
          },
        ],
        properties: { options: {} },
      } as never),
    ).toBe(false);
  });
});
