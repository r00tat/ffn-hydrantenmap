import { describe, expect, it } from 'vitest';
import {
  boundsContain,
  filterEventsByBounds,
  padBounds,
} from './roadEventsBounds';
import { RoadEventWithPath } from './roadEvents';

const view = { south: 47.9, west: 16.8, north: 48.0, east: 17.0 };

function event(path: [number, number][]): RoadEventWithPath {
  return {
    key: path.join('|'),
    id: 'x',
    version: '1',
    source: 'evis',
    kind: 'closure',
    recordTypes: [],
    from: path[0],
    to: path[path.length - 1],
    path,
    approximate: false,
  };
}

describe('padBounds', () => {
  it('erweitert je Seite um den Anteil der Breite bzw. Höhe', () => {
    const padded = padBounds(view, 1);
    expect(padded.south).toBeCloseTo(47.8);
    expect(padded.north).toBeCloseTo(48.1);
    expect(padded.west).toBeCloseTo(16.6);
    expect(padded.east).toBeCloseTo(17.2);
  });
});

describe('boundsContain', () => {
  it('erkennt, ob der Ausschnitt noch im geladenen Bereich liegt', () => {
    const loaded = padBounds(view, 1);
    expect(boundsContain(loaded, view)).toBe(true);
    expect(boundsContain(loaded, { ...view, east: 17.3, west: 17.1 })).toBe(
      false
    );
  });
});

describe('filterEventsByBounds', () => {
  it('behält Meldungen, deren Verlauf den Bereich berührt', () => {
    const inside = event([[47.95, 16.9]]);
    const crossing = event([
      [47.95, 16.5],
      [47.95, 17.5],
    ]);
    const outside = event([
      [47.0, 16.0],
      [47.1, 16.1],
    ]);

    expect(
      filterEventsByBounds([inside, crossing, outside], view).map((e) => e.key)
    ).toEqual([inside.key, crossing.key]);
  });
});
