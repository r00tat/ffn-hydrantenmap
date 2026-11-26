import { describe, expect, it } from 'vitest';
import { LatLng } from '../../common/roadEvents';
import {
  buildMotorwayGraph,
  encodeCoordinates,
  findMotorwayPath,
  LinkDirection,
  MotorwayNetworkFile,
} from './motorwayPath';

/**
 * Künstliches Netz (Breite ~48.0, Länge 16.00 … 16.03, ~750 m je 0.01°):
 *
 *   Fahrbahn Ost   1 ──► 2 ──► 3 ──► 4      (Breite 48.0000)
 *   Fahrbahn West  8 ◄── 7 ◄── 6 ◄── 5      (Breite 47.9997, ~33 m südlich)
 *   Umkehr         4 ──► 5  und  8 ──► 1
 */
const EAST = 48.0;
const WEST = 47.9997;

function link(
  from: number,
  to: number,
  direction: LinkDirection,
  coords: LatLng[]
): MotorwayNetworkFile['links'][number] {
  return [from, to, direction, encodeCoordinates(coords)];
}

const network: MotorwayNetworkFile = {
  source: 'Test',
  generated: '2026-11-26',
  links: [
    link(1, 2, 1, [[EAST, 16.0], [EAST, 16.01]]),
    link(2, 3, 1, [[EAST, 16.01], [EAST, 16.015], [EAST, 16.02]]),
    link(3, 4, 1, [[EAST, 16.02], [EAST, 16.03]]),
    link(5, 6, 1, [[WEST, 16.03], [WEST, 16.02]]),
    link(6, 7, 1, [[WEST, 16.02], [WEST, 16.01]]),
    link(7, 8, 1, [[WEST, 16.01], [WEST, 16.0]]),
    link(4, 5, 1, [[EAST, 16.03], [WEST, 16.031], [WEST, 16.03]]),
    link(8, 1, 1, [[WEST, 16.0], [EAST, 15.999], [EAST, 16.0]]),
  ],
};

const graph = buildMotorwayGraph(network);

describe('encodeCoordinates', () => {
  it('kodiert Koordinaten verlustarm als Differenzen', () => {
    const coords: LatLng[] = [
      [48.12345, 16.54321],
      [48.12346, 16.5433],
    ];
    const g = buildMotorwayGraph({
      source: 't',
      generated: 't',
      links: [[1, 2, 2, encodeCoordinates(coords)]],
    });
    expect(g.links[0].coords[1][0]).toBeCloseTo(48.12346, 5);
    expect(g.links[0].coords[1][1]).toBeCloseTo(16.5433, 5);
  });
});

describe('findMotorwayPath', () => {
  it('folgt der Fahrbahn in Fahrtrichtung über mehrere Links', () => {
    const result = findMotorwayPath(
      graph,
      [EAST + 0.00005, 16.005],
      [EAST - 0.00005, 16.025]
    );

    expect(result.approximate).toBe(false);
    // Start und Ende liegen auf der Fahrbahn, dazwischen die Stützpunkte
    expect(result.path[0][1]).toBeCloseTo(16.005, 4);
    expect(result.path.at(-1)?.[1]).toBeCloseTo(16.025, 4);
    expect(result.path.some(([, lng]) => lng === 16.015)).toBe(true);
    expect(result.path.every(([lat]) => lat === EAST)).toBe(true);
  });

  it('nimmt die Gegenfahrbahn, wenn die Richtung dorthin passt', () => {
    const result = findMotorwayPath(
      graph,
      [WEST + 0.00001, 16.025],
      [WEST, 16.005]
    );

    expect(result.approximate).toBe(false);
    expect(result.path.every(([lat]) => lat === WEST)).toBe(true);
  });

  it('liegt der Abschnitt auf einem Link, wird nur das Stück dazwischen gezeichnet', () => {
    const result = findMotorwayPath(graph, [EAST, 16.012], [EAST, 16.018]);

    expect(result.approximate).toBe(false);
    expect(result.path).toEqual([
      [EAST, 16.012],
      [EAST, 16.015],
      [EAST, 16.018],
    ]);
  });

  it('fällt auf eine gerade Linie zurück, wenn ein Punkt fern vom Netz liegt', () => {
    const from: LatLng = [48.1, 16.005];
    const to: LatLng = [EAST, 16.025];
    const result = findMotorwayPath(graph, from, to);

    expect(result).toEqual({ path: [from, to], approximate: true });
  });

  it('fällt auf eine gerade Linie zurück, wenn nur ein großer Umweg möglich wäre', () => {
    // Nur eine Fahrbahn plus weite Schleife: gegen die Fahrtrichtung ginge
    // es nur über die Schleife (~5 km statt 1,5 km Luftlinie).
    const oneWay = buildMotorwayGraph({
      source: 'Test',
      generated: '2026-11-26',
      links: [
        network.links[0],
        network.links[1],
        network.links[2],
        link(4, 1, 1, [
          [EAST, 16.03],
          [48.01, 16.03],
          [48.01, 16.0],
          [EAST, 16.0],
        ]),
      ],
    });
    const from: LatLng = [EAST, 16.025];
    const to: LatLng = [EAST, 16.005];

    expect(findMotorwayPath(oneWay, from, to)).toEqual({
      path: [from, to],
      approximate: true,
    });
    // Mit großzügiger Schranke wird die Schleife akzeptiert
    expect(
      findMotorwayPath(oneWay, from, to, { maxDetourMeters: 10_000 }).approximate
    ).toBe(false);
  });

  it('zeichnet einen Punkt-Abschnitt als einzelnen Punkt', () => {
    const result = findMotorwayPath(graph, [EAST, 16.012], [EAST, 16.012]);
    expect(result.path).toHaveLength(1);
  });
});
