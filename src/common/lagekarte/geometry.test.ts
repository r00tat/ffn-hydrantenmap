import { describe, expect, it } from 'vitest';
import {
  closeRing,
  geoJsonToPositions,
  itemPositions,
  openRing,
  positionsToGeoJson,
} from './geometry';

describe('itemPositions', () => {
  it('liest den positions-JSON-String', () => {
    expect(
      itemPositions({ positions: '[[47.9,16.8],[47.91,16.81]]' } as never),
    ).toEqual([
      [47.9, 16.8],
      [47.91, 16.81],
    ]);
  });

  it('fällt auf lat/lng und destLat/destLng zurück', () => {
    expect(
      itemPositions({
        lat: 47.9,
        lng: 16.8,
        destLat: 47.91,
        destLng: 16.81,
      } as never),
    ).toEqual([
      [47.9, 16.8],
      [47.91, 16.81],
    ]);
  });

  it('gibt bei kaputtem JSON ein leeres Array zurück statt zu werfen', () => {
    expect(itemPositions({ positions: 'nicht json' } as never)).toEqual([]);
  });

  it('gibt bei fehlender Geometrie ein leeres Array zurück', () => {
    expect(itemPositions({} as never)).toEqual([]);
  });
});

describe('positionsToGeoJson', () => {
  it('tauscht lat/lng zu lng/lat', () => {
    expect(
      positionsToGeoJson([
        [47.9, 16.8],
        [47.91, 16.81],
      ]),
    ).toEqual([
      [16.8, 47.9],
      [16.81, 47.91],
    ]);
  });
});

describe('geoJsonToPositions', () => {
  it('ist invers zu positionsToGeoJson', () => {
    const positions: [number, number][] = [
      [47.9, 16.8],
      [47.91, 16.81],
    ];
    expect(geoJsonToPositions(positionsToGeoJson(positions))).toEqual(positions);
  });

  it('ignoriert Koordinaten mit weniger als zwei Werten', () => {
    expect(geoJsonToPositions([[16.8, 47.9], [16.8] as never])).toEqual([
      [47.9, 16.8],
    ]);
  });
});

describe('closeRing', () => {
  it('hängt den ersten Punkt an, wenn der Ring offen ist', () => {
    expect(
      closeRing([
        [16.8, 47.9],
        [16.81, 47.9],
        [16.81, 47.91],
      ]),
    ).toEqual([
      [16.8, 47.9],
      [16.81, 47.9],
      [16.81, 47.91],
      [16.8, 47.9],
    ]);
  });

  it('lässt einen bereits geschlossenen Ring unverändert', () => {
    const ring: [number, number][] = [
      [16.8, 47.9],
      [16.81, 47.9],
      [16.8, 47.9],
    ];
    expect(closeRing(ring)).toEqual(ring);
  });

  it('lässt einen Ring mit weniger als drei Punkten unverändert', () => {
    expect(closeRing([[16.8, 47.9]])).toEqual([[16.8, 47.9]]);
  });
});

describe('openRing', () => {
  it('entfernt den doppelten Schlusspunkt', () => {
    expect(
      openRing([
        [47.9, 16.8],
        [47.9, 16.81],
        [47.91, 16.81],
        [47.9, 16.8],
      ]),
    ).toEqual([
      [47.9, 16.8],
      [47.9, 16.81],
      [47.91, 16.81],
    ]);
  });

  it('lässt einen offenen Ring unverändert', () => {
    const ring: [number, number][] = [
      [47.9, 16.8],
      [47.9, 16.81],
    ];
    expect(openRing(ring)).toEqual(ring);
  });
});
