// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mercatorX, mercatorY } from '../../../common/terrain/terrainMesh';
import type { TerrainMesh } from '../../../common/terrain/terrainTypes';
import {
  contourPaths,
  markerPlacements,
  pumpPlacements,
  scenePath,
  sceneProjector,
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
