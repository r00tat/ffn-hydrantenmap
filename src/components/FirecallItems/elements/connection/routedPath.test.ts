import { describe, expect, it } from 'vitest';
import type { LatLngPosition } from '../../../../common/geo';
import type { RoutedLeg } from '../../../actions/maps/routes';
import { positionsSignature, stitchRoutedPositions } from './routedPath';

const hydrant: LatLngPosition = [47.9482, 16.8482];
const verteiler: LatLngPosition = [47.9502, 16.8512];
const rohr: LatLngPosition = [47.9522, 16.8542];

/** Ein Straßenverlauf, der neben den Punkten liegt. */
const leg = (positions: LatLngPosition[]): RoutedLeg => ({
  positions,
  distanceMeters: 0,
});

describe('stitchRoutedPositions', () => {
  it('setzt die Zuführung vom Punkt zur Straße vor und hinter jeden Abschnitt', () => {
    // Der Kern der Sache: Die Route beginnt auf der Straße, der Hydrant liegt
    // daneben. Ohne die Zuführung fehlten die Meter vom Hydranten zur Straße.
    const onRoadStart: LatLngPosition = [47.9483, 16.8485];
    const onRoadEnd: LatLngPosition = [47.9501, 16.8515];

    expect(
      stitchRoutedPositions(
        [hydrant, verteiler],
        [leg([onRoadStart, [47.949, 16.85], onRoadEnd])]
      )
    ).toEqual([hydrant, onRoadStart, [47.949, 16.85], onRoadEnd, verteiler]);
  });

  it('führt die Leitung durch jeden gesetzten Punkt', () => {
    // Ein Verteiler steht neben der Straße; die Leitung muss zu ihm hin und
    // wieder zurück zur Straße, nicht an ihm vorbei.
    const path = stitchRoutedPositions(
      [hydrant, verteiler, rohr],
      [
        leg([
          [47.9483, 16.8485],
          [47.9501, 16.8515],
        ]),
        leg([
          [47.9501, 16.8515],
          [47.9521, 16.8545],
        ]),
      ]
    );

    expect(path).toEqual([
      hydrant,
      [47.9483, 16.8485],
      [47.9501, 16.8515],
      verteiler,
      [47.9501, 16.8515],
      [47.9521, 16.8545],
      rohr,
    ]);
  });

  it('lässt doppelte Punkte weg, wenn der Punkt schon auf der Straße liegt', () => {
    // Google setzt den Startpunkt auf die Straße; liegt der Punkt bereits dort,
    // wäre die Zuführung ein Segment der Länge 0.
    expect(
      stitchRoutedPositions([hydrant, verteiler], [leg([hydrant, verteiler])])
    ).toEqual([hydrant, verteiler]);
  });

  it('verbindet Punkte direkt, für die kein Abschnitt vorliegt', () => {
    expect(stitchRoutedPositions([hydrant, verteiler, rohr], [])).toEqual([
      hydrant,
      verteiler,
      rohr,
    ]);
  });

  it('gibt einen einzelnen Punkt unverändert zurück', () => {
    expect(stitchRoutedPositions([hydrant], [])).toEqual([hydrant]);
    expect(stitchRoutedPositions([], [])).toEqual([]);
  });
});

describe('positionsSignature', () => {
  it('unterscheidet verschobene Punkte', () => {
    // Die Signatur entscheidet, ob die gespeicherte Geometrie noch zu den
    // Punkten gehört — ein verschobener Punkt muss sie ungültig machen.
    expect(positionsSignature([hydrant, verteiler])).not.toBe(
      positionsSignature([hydrant, [47.9503, 16.8512]])
    );
  });

  it('unterscheidet hinzugefügte und entfernte Punkte', () => {
    expect(positionsSignature([hydrant, verteiler])).not.toBe(
      positionsSignature([hydrant, verteiler, rohr])
    );
  });

  it('ist für dieselben Punkte stabil', () => {
    expect(positionsSignature([hydrant, verteiler])).toBe(
      positionsSignature([
        [47.9482, 16.8482],
        [47.9502, 16.8512],
      ])
    );
  });
});
