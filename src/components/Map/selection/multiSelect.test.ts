import { describe, expect, it } from 'vitest';
import type { FirecallItem } from '../../firebase/firestore';
import {
  boundsFromCorners,
  isItemInBounds,
  isMultiSelectable,
  itemPositions,
  positionSignature,
  previewDeltaFor,
  previewedCenter,
  selectionCenter,
  selectItemsInBounds,
  toggleSelected,
  translateItem,
} from './multiSelect';

const marker = (id: string, lat: number, lng: number, extra = {}) =>
  ({ id, type: 'marker', name: id, lat, lng, ...extra }) as FirecallItem;

const line = (id: string, positions: [number, number][], extra = {}) =>
  ({
    id,
    type: 'line',
    name: id,
    lat: positions[0][0],
    lng: positions[0][1],
    destLat: positions[positions.length - 1][0],
    destLng: positions[positions.length - 1][1],
    positions: JSON.stringify(positions),
    ...extra,
  }) as unknown as FirecallItem;

describe('boundsFromCorners', () => {
  it('normalisiert die Ecken unabhängig von der Zugrichtung', () => {
    expect(boundsFromCorners({ lat: 48, lng: 17 }, { lat: 47, lng: 16 })).toEqual(
      { south: 47, west: 16, north: 48, east: 17 }
    );
  });
});

describe('itemPositions', () => {
  it('liefert die Position eines Markers', () => {
    expect(itemPositions(marker('a', 47.9, 16.8))).toEqual([[47.9, 16.8]]);
  });

  it('liefert alle Punkte einer Linie', () => {
    expect(
      itemPositions(
        line('l', [
          [1, 2],
          [3, 4],
          [5, 6],
        ])
      )
    ).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
  });

  it('fällt bei Linien ohne positions auf lat/lng und destLat/destLng zurück', () => {
    const item = {
      id: 'c',
      type: 'connection',
      name: 'c',
      lat: 1,
      lng: 2,
      destLat: 3,
      destLng: 4,
    } as unknown as FirecallItem;
    expect(itemPositions(item)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });
});

describe('isItemInBounds', () => {
  const bounds = { south: 0, west: 0, north: 10, east: 10 };

  it('erkennt einen Marker im Rahmen', () => {
    expect(isItemInBounds(marker('a', 5, 5), bounds)).toBe(true);
    expect(isItemInBounds(marker('b', 11, 5), bounds)).toBe(false);
  });

  it('nimmt eine Linie, sobald ein Punkt im Rahmen liegt', () => {
    expect(
      isItemInBounds(
        line('l', [
          [20, 20],
          [5, 5],
        ]),
        bounds
      )
    ).toBe(true);
    expect(
      isItemInBounds(
        line('l', [
          [20, 20],
          [30, 30],
        ]),
        bounds
      )
    ).toBe(false);
  });
});

describe('isMultiSelectable', () => {
  it('lässt normale Elemente zu', () => {
    expect(isMultiSelectable(marker('a', 1, 1))).toBe(true);
    expect(isMultiSelectable(line('l', [[1, 1], [2, 2]]))).toBe(true);
  });

  it('schließt gesperrte, nicht verschiebbare und gelöschte Elemente aus', () => {
    expect(isMultiSelectable(marker('a', 1, 1, { editable: false }))).toBe(false);
    expect(isMultiSelectable(marker('a', 1, 1, { draggable: false }))).toBe(false);
    expect(isMultiSelectable(marker('a', 1, 1, { deleted: true }))).toBe(false);
    expect(isMultiSelectable(marker('', 1, 1))).toBe(false);
  });

  it('schließt Zeichnungen und Wasserstände aus', () => {
    expect(isMultiSelectable(marker('d', 1, 1, { type: 'drawing' }))).toBe(false);
    expect(isMultiSelectable(marker('w', 1, 1, { type: 'wasserstand' }))).toBe(
      false
    );
  });
});

describe('selectItemsInBounds', () => {
  it('liefert die IDs der wählbaren Elemente im Rahmen', () => {
    const items = [
      marker('a', 5, 5),
      marker('b', 50, 50),
      marker('c', 5, 5, { editable: false }),
      line('l', [
        [5, 5],
        [50, 50],
      ]),
    ];
    expect(
      selectItemsInBounds(items, { south: 0, west: 0, north: 10, east: 10 })
    ).toEqual(['a', 'l']);
  });

  it('nimmt dasselbe Element nur einmal', () => {
    const items = [marker('a', 5, 5), marker('a', 5, 5)];
    expect(
      selectItemsInBounds(items, { south: 0, west: 0, north: 10, east: 10 })
    ).toEqual(['a']);
  });
});

describe('toggleSelected', () => {
  it('fügt hinzu und entfernt wieder', () => {
    const once = toggleSelected(new Set(['a']), 'b');
    expect([...once].sort()).toEqual(['a', 'b']);
    expect([...toggleSelected(once, 'a')]).toEqual(['b']);
  });
});

describe('translateItem', () => {
  it('verschiebt einen Marker und nennt Vorher und Nachher', () => {
    const result = translateItem(marker('a', 47, 16), { lat: 0.5, lng: -0.25 });
    expect(result).toEqual({
      previousValue: { lat: 47, lng: 16 },
      newValue: { lat: 47.5, lng: 15.75 },
    });
  });

  it('verschiebt alle Punkte einer Linie samt lat/lng und destLat/destLng', () => {
    const item = line('l', [
      [1, 2],
      [3, 4],
    ]);
    const result = translateItem(item, { lat: 1, lng: 1 });
    expect(result?.newValue).toEqual({
      positions: JSON.stringify([
        [2, 3],
        [4, 5],
      ]),
      lat: 2,
      lng: 3,
      destLat: 4,
      destLng: 5,
    });
    expect(result?.previousValue).toEqual({
      positions: JSON.stringify([
        [1, 2],
        [3, 4],
      ]),
      lat: 1,
      lng: 2,
      destLat: 3,
      destLng: 4,
    });
  });

  it('lässt Länge und Fläche unberührt — eine Verschiebung ändert sie nicht', () => {
    const item = line('l', [[1, 2], [3, 4]], { distance: 123, area: 55 });
    const result = translateItem(item, { lat: 1, lng: 1 });
    expect(result?.newValue).not.toHaveProperty('distance');
    expect(result?.newValue).not.toHaveProperty('area');
  });

  it('schreibt destLat/destLng nur, wenn das Element sie führt', () => {
    const area = {
      id: 'f',
      type: 'area',
      name: 'f',
      lat: 1,
      lng: 1,
      positions: JSON.stringify([
        [1, 1],
        [2, 2],
        [1, 2],
      ]),
    } as unknown as FirecallItem;
    const result = translateItem(area, { lat: 1, lng: 0 });
    expect(result?.newValue).toEqual({
      positions: JSON.stringify([
        [2, 1],
        [3, 2],
        [2, 2],
      ]),
      lat: 2,
      lng: 1,
    });
  });

  it('liefert nichts bei einer Verschiebung um null', () => {
    expect(translateItem(marker('a', 1, 1), { lat: 0, lng: 0 })).toBeUndefined();
  });
});

describe('positionSignature und previewDeltaFor', () => {
  it('wendet die Vorschau nur an, solange das Element noch an der Ausgangslage steht', () => {
    const item = marker('a', 1, 1);
    const preview = {
      delta: { lat: 1, lng: 1 },
      sourceId: 'x',
      origins: { a: positionSignature(item) },
    };
    expect(previewDeltaFor(item, preview)).toEqual({ lat: 1, lng: 1 });
    // Der Schreibvorgang ist angekommen: das Dokument steht schon am Ziel.
    expect(previewDeltaFor(marker('a', 2, 2), preview)).toBeUndefined();
    // Nicht Teil der Verschiebung.
    expect(previewDeltaFor(marker('b', 1, 1), preview)).toBeUndefined();
    expect(previewDeltaFor(item, undefined)).toBeUndefined();
  });

  it('wendet die Vorschau nicht auf das gezogene Element selbst an', () => {
    const item = marker('a', 1, 1);
    const preview = {
      delta: { lat: 1, lng: 1 },
      sourceId: 'a',
      origins: { a: positionSignature(item) },
    };
    expect(previewDeltaFor(item, preview)).toBeUndefined();
  });
});

describe('selectionCenter', () => {
  it('liefert die Mitte des umschließenden Rechtecks', () => {
    expect(
      selectionCenter([
        marker('a', 0, 0),
        line('l', [
          [2, 4],
          [1, 1],
        ]),
      ])
    ).toEqual({ lat: 1, lng: 2 });
  });

  it('liefert nichts ohne Elemente', () => {
    expect(selectionCenter([])).toBeUndefined();
  });
});

describe('previewedCenter', () => {
  it('rechnet die laufende Vorschau mit ein', () => {
    const items = [marker('a', 0, 0), marker('b', 2, 2)];
    const preview = {
      delta: { lat: 10, lng: 10 },
      sourceId: 'handle',
      origins: Object.fromEntries(items.map((i) => [i.id, positionSignature(i)])),
    };
    expect(previewedCenter(items, preview)).toEqual({ lat: 11, lng: 11 });
    expect(previewedCenter(items, undefined)).toEqual({ lat: 1, lng: 1 });
  });
});
