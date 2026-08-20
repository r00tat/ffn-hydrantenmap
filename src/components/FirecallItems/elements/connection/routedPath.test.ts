import { describe, expect, it } from 'vitest';
import type { LatLngPosition } from '../../../../common/geo';
import type { RoutedLeg } from '../../../actions/maps/routes';
import {
  routingProfile,
  routingSignature,
  stitchRoutedPositions,
} from './routedPath';

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

describe('routingSignature', () => {
  it('unterscheidet verschobene Punkte', () => {
    // Die Signatur entscheidet, ob die gespeicherte Geometrie noch gilt — ein
    // verschobener Punkt muss sie ungültig machen.
    expect(routingSignature([hydrant, verteiler], 'walk')).not.toBe(
      routingSignature([hydrant, [47.9503, 16.8512]], 'walk')
    );
  });

  it('unterscheidet hinzugefügte und entfernte Punkte', () => {
    expect(routingSignature([hydrant, verteiler], 'walk')).not.toBe(
      routingSignature([hydrant, verteiler, rohr], 'walk')
    );
  });

  it('unterscheidet die Profile', () => {
    // Ein Wechsel von Fuß auf Auto ändert die Route, ohne einen Punkt zu
    // verschieben. Ohne das blieb die alte Geometrie stehen.
    expect(routingSignature([hydrant, verteiler], 'walk')).not.toBe(
      routingSignature([hydrant, verteiler], 'drive')
    );
  });

  it('ist für dieselbe Lage stabil', () => {
    expect(routingSignature([hydrant, verteiler], 'walk')).toBe(
      routingSignature(
        [
          [47.9482, 16.8482],
          [47.9502, 16.8512],
        ],
        'walk'
      )
    );
  });
});

describe('routingProfile', () => {
  it('nimmt das Auto-Profil nur beim genauen Wert', () => {
    expect(routingProfile('drive')).toBe('drive');
  });

  it('fällt auf Fuß zurück — der Wert kommt aus dem Browser', () => {
    expect(routingProfile(undefined)).toBe('walk');
    expect(routingProfile('')).toBe('walk');
    expect(routingProfile('DRIVE')).toBe('walk');
    expect(routingProfile('fliegen')).toBe('walk');
  });
});
