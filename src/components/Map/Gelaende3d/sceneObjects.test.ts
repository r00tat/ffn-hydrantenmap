// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mercatorX, mercatorY } from '../../../common/terrain/terrainMesh';
import type { TerrainMesh } from '../../../common/terrain/terrainTypes';
import {
  clipRingToExtent,
  contourLabels,
  contourPaths,
  markerPlacements,
  pumpPlacements,
  ringPolygons,
  scenePath,
  sceneProjector,
  waterSurfaces,
} from './sceneObjects';

/**
 * Ein 2 × 2-Netz um Neusiedl, Höhen 100/110/120/130 (NW, NE, SW, SE).
 *
 * Das Mercator-Rechteck liegt **symmetrisch um die Mitte**, nicht zwischen
 * zwei Breitengraden: `mercatorY` ist nicht linear, und aus dem Mittel zweier
 * Breiten läge der Ursprung gut 10 cm neben der angegebenen Mitte.
 */
const testMesh = (holes = new Uint8Array(4)): TerrainMesh => {
  const center: [number, number] = [47.95, 16.85];
  const cy = mercatorY(center[0]);
  const cx = mercatorX(center[1]);
  const merc = {
    xMin: cx - 750,
    xMax: cx + 750,
    yMin: cy - 750,
    yMax: cy + 750,
  };
  return {
    positions: Float32Array.from([
      -500, 100, -500, 500, 110, -500, -500, 120, 500, 500, 130, 500,
    ]),
    indices: Uint32Array.from([0, 2, 1, 1, 2, 3]),
    holes,
    cols: 2,
    rows: 2,
    widthM: 1000,
    depthM: 1000,
    minM: 100,
    maxM: 130,
    level: 'detail',
    resolutionM: 1,
    center,
    merc,
  };
};

describe('sceneProjector', () => {
  it('legt die Mitte des Ausschnitts in den Ursprung', () => {
    const projector = sceneProjector(testMesh());
    const point = projector.toScene([47.95, 16.85]);
    expect(point.x).toBeCloseTo(0, 3);
    expect(point.z).toBeCloseTo(0, 3);
  });

  it('legt Norden nach -z', () => {
    const projector = sceneProjector(testMesh());
    expect(projector.toScene([47.96, 16.85]).z).toBeLessThan(0);
  });

  it('interpoliert die Geländehöhe', () => {
    const projector = sceneProjector(testMesh());
    expect(projector.groundAt({ x: 0, z: 0 })).toBeCloseTo(115, 6);
  });

  it('liefert über einem Loch keine Höhe', () => {
    const projector = sceneProjector(testMesh(Uint8Array.from([0, 0, 0, 1])));
    expect(projector.groundAt({ x: 0, z: 0 })).toBeUndefined();
  });
});

/** Name und Symbol spielen für die Verortung keine Rolle. */
const look = () => ({ name: 'Marke', iconUrl: '/icon.png' });

describe('markerPlacements', () => {
  it('übergeht Objekte ohne Position', () => {
    const projector = sceneProjector(testMesh());
    const placements = markerPlacements(
      [{ id: 'a', name: 'ohne', type: 'marker' }],
      projector,
      look
    );
    expect(placements).toHaveLength(0);
  });

  it('verankert eine Marke auf der Geländehöhe', () => {
    const projector = sceneProjector(testMesh());
    const placements = markerPlacements(
      [{ id: 'a', name: 'Standort', type: 'marker', lat: 47.95, lng: 16.85 }],
      projector,
      look
    );
    expect(placements).toHaveLength(1);
    expect(placements[0].groundM).toBeCloseTo(115, 6);
  });
});

describe('pumpPlacements', () => {
  it('übergeht Elemente ohne Förderung', () => {
    const projector = sceneProjector(testMesh());
    const placements = pumpPlacements(
      [
        {
          id: 'c',
          name: 'Leitung',
          type: 'connection',
          lat: 47.95,
          lng: 16.85,
          destLat: 47.951,
          destLng: 16.851,
        } as never,
      ],
      projector
    );
    // Ohne eingeschaltete Förderung liefert `foerderungView` undefined.
    expect(placements).toHaveLength(0);
  });
});

describe('scenePath', () => {
  it('hebt den Zug über das Gelände', () => {
    const projector = sceneProjector(testMesh());
    const path = scenePath([[47.95, 16.85]], projector, 2);
    expect(path[1]).toBeCloseTo(117, 6);
  });

  it('lässt Punkte ohne Geländehöhe weg', () => {
    const projector = sceneProjector(testMesh());
    const path = scenePath(
      [
        [47.95, 16.85],
        [47.99, 16.99],
      ],
      projector
    );
    expect(path).toHaveLength(3);
  });
});

describe('contourPaths', () => {
  it('nimmt die Höhe der Linie, nicht die des Netzes', () => {
    const projector = sceneProjector(testMesh());
    const paths = contourPaths(
      [
        {
          heightM: 111,
          closed: false,
          points: [
            [47.95, 16.85],
            [47.9505, 16.8505],
          ],
        },
      ],
      projector,
      0
    );
    expect(paths[0].points[1]).toBeCloseTo(111, 6);
  });
});

describe('ringPolygons', () => {
  const square = (size: number): { x: number; z: number }[] => [
    { x: -size, z: -size },
    { x: size, z: -size },
    { x: size, z: size },
    { x: -size, z: size },
  ];

  it('erkennt einen Ring im Ring als Loch', () => {
    const polygons = ringPolygons([square(100), square(20)]);
    expect(polygons).toHaveLength(1);
    expect(polygons[0].holes).toHaveLength(1);
    expect(polygons[0].outer[1].x).toBe(100);
  });

  it('lässt getrennte Ringe getrennt', () => {
    const shifted = square(10).map((p) => ({ x: p.x + 500, z: p.z }));
    const polygons = ringPolygons([square(10), shifted]);
    expect(polygons).toHaveLength(2);
    expect(polygons.every((p) => p.holes.length === 0)).toBe(true);
  });

  it('macht aus einer Insel im Loch wieder eine Fläche', () => {
    // Even-odd: Umriss, Loch, Insel darin.
    const polygons = ringPolygons([square(100), square(50), square(10)]);
    expect(polygons).toHaveLength(2);
    const outer = polygons.find((p) => p.outer[1].x === 100);
    expect(outer?.holes).toHaveLength(1);
  });

  it('übergeht Ringe mit weniger als drei Punkten', () => {
    expect(
      ringPolygons([
        [
          { x: 0, z: 0 },
          { x: 1, z: 1 },
        ],
      ])
    ).toHaveLength(0);
  });
});

describe('waterSurfaces', () => {
  it('übergeht ein Element ohne gerechnete Fläche', () => {
    const projector = sceneProjector(testMesh());
    const surfaces = waterSurfaces(
      [
        {
          id: 'w',
          name: 'Hochwasser',
          type: 'wasserstand',
          lat: 47.95,
          lng: 16.85,
        } as never,
      ],
      projector
    );
    expect(surfaces).toHaveLength(0);
  });
});

describe('contourLabels', () => {
  const line = (heightM: number) => ({
    heightM,
    closed: false,
    points: [
      [47.949, 16.849],
      [47.95, 16.85],
      [47.951, 16.851],
    ] as [number, number][],
  });

  it('beschriftet nur die Zähllinien', () => {
    const projector = sceneProjector(testMesh());
    // Bei 1 m Äquidistanz ist jede fünfte Linie eine Zähllinie.
    const labels = contourLabels(
      [line(110), line(111), line(115)],
      projector,
      1
    );
    expect(labels.map((l) => l.text)).toEqual(['110', '115']);
  });

  it('dünnt gleichmäßig aus, statt vorne abzuschneiden', () => {
    const projector = sceneProjector(testMesh());
    const many = Array.from({ length: 40 }, (_, i) => line(5 * (i + 1)));
    const labels = contourLabels(many, projector, 1, 4);
    expect(labels).toHaveLength(4);
    // Der letzte Wert stammt aus dem hinteren Teil der Liste, nicht aus den
    // ersten vier.
    expect(Number(labels[3].text)).toBeGreaterThan(100);
  });

  it('setzt die Angabe auf die Höhe der Linie', () => {
    const projector = sceneProjector(testMesh());
    const labels = contourLabels([line(115)], projector, 1);
    expect(labels[0].heightM).toBe(115);
  });
});

describe('clipRingToExtent', () => {
  it('lässt einen Ring innerhalb des Rahmens unverändert', () => {
    const ring = [
      { x: -10, z: -10 },
      { x: 10, z: -10 },
      { x: 10, z: 10 },
    ];
    expect(clipRingToExtent(ring, 100, 100)).toEqual(ring);
  });

  it('schneidet einen Ring auf den Rahmen zu', () => {
    // Ein Ring, der weit über den Ausschnitt hinausreicht.
    const ring = [
      { x: -1000, z: -1000 },
      { x: 1000, z: -1000 },
      { x: 1000, z: 1000 },
      { x: -1000, z: 1000 },
    ];
    const clipped = clipRingToExtent(ring, 50, 30);
    expect(clipped.every((p) => Math.abs(p.x) <= 50 + 1e-9)).toBe(true);
    expect(clipped.every((p) => Math.abs(p.z) <= 30 + 1e-9)).toBe(true);
    // Aus dem großen Ring wird genau der Rahmen.
    expect(clipped).toHaveLength(4);
  });

  it('lässt einen Ring ganz außerhalb verschwinden', () => {
    const ring = [
      { x: 500, z: 500 },
      { x: 600, z: 500 },
      { x: 600, z: 600 },
    ];
    expect(clipRingToExtent(ring, 100, 100)).toHaveLength(0);
  });
});
