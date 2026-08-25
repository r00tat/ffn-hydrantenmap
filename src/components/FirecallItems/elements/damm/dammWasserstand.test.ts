import { describe, expect, it } from 'vitest';
import { serialiseWasserBaender } from '../../../../common/terrain/wasserstand';
import type { Line, Wasserstand } from '../../../firebase/firestore';
import {
  dammHoeheAusWasserstand,
  wasserstandeFuerLinie,
} from './dammWasserstand';

/** Quadrat um 47,94/16,84, etwa 1,1 km × 0,75 km. */
const flaeche: [number, number][] = [
  [47.94, 16.84],
  [47.95, 16.84],
  [47.95, 16.85],
  [47.94, 16.85],
  [47.94, 16.84],
];

const szenario = (overrides: Partial<Wasserstand> = {}): Wasserstand =>
  ({
    id: 'w1',
    type: 'wasserstand',
    name: 'Wulka Nord',
    lat: 47.945,
    lng: 16.845,
    wasserBasisHoehe: 115.8,
    wasserZuschlag: 0.5,
    wasserStufe: 'detail',
    wasserBaender: serialiseWasserBaender([{ tiefeM: 0, ringe: [flaeche] }]),
    ...overrides,
  }) as Wasserstand;

const linie = (overrides: Partial<Line> = {}): Line =>
  ({
    id: 'l1',
    type: 'line',
    name: 'Damm Süd',
    lat: 47.9445,
    lng: 16.8445,
    destLat: 47.9455,
    destLng: 16.8455,
    freibord: 0.3,
    ...overrides,
  }) as Line;

describe('dammWasserstand', () => {
  it('nimmt die größte Tiefe entlang der Linie und schlägt den Freibord auf', () => {
    // Gelände fällt nach Osten: 115,0 m am Anfang, 114,6 m am Ende.
    const heights = [115.0, 114.8, 114.6];
    const result = dammHoeheAusWasserstand({
      item: linie(),
      szenario: szenario(),
      // Abtastpunkte samt Höhen werden hereingegeben: die Höhenabfrage ist
      // Sache des Aufrufers, damit die Rechnung ohne Netz prüfbar bleibt.
      samples: [
        { position: [47.9446, 16.8446], heightM: heights[0] },
        { position: [47.945, 16.845], heightM: heights[1] },
        { position: [47.9454, 16.8454], heightM: heights[2] },
      ],
      freibord: 0.3,
    });
    // h = 116,3; tiefster Punkt 114,6 → 1,7 m Tiefe, plus 0,3 m Freibord.
    expect(result.maxTiefeM).toBeCloseTo(1.7, 6);
    expect(result.dammHoehe).toBeCloseTo(2, 6);
    expect(result.trocken).toBe(false);
  });

  it('Punkte außerhalb der Fläche zählen trocken', () => {
    const result = dammHoeheAusWasserstand({
      item: linie(),
      szenario: szenario(),
      samples: [
        // Weit außerhalb des Quadrats.
        { position: [47.8, 16.7], heightM: 100 },
      ],
      freibord: 0.3,
    });
    expect(result.trocken).toBe(true);
    expect(result.maxTiefeM).toBe(0);
    expect(result.dammHoehe).toBeUndefined();
  });

  it('warnt, wenn Tiefe plus Freibord über die Reichweite geht', () => {
    const result = dammHoeheAusWasserstand({
      item: linie(),
      szenario: szenario(),
      samples: [{ position: [47.945, 16.845], heightM: 113.0 }],
      freibord: 0.3,
      maxHoehe: 2,
    });
    // 116,3 − 113,0 = 3,3 m plus 0,3 m Freibord.
    expect(result.ueberMax).toBe(true);
    expect(result.dammHoehe).toBeCloseTo(3.6, 6);
  });

  it('rundet auf die Schrittweite des Reglers', () => {
    const result = dammHoeheAusWasserstand({
      item: linie(),
      szenario: szenario(),
      samples: [{ position: [47.945, 16.845], heightM: 115.23 }],
      freibord: 0.3,
    });
    // 116,3 − 115,23 = 1,07 → 1,37 → gerundet 1,4.
    expect(result.dammHoehe).toBeCloseTo(1.4, 6);
  });

  it('ordnet Szenarien, deren Fläche die Linie berührt, nach vorne', () => {
    const nah = szenario({ id: 'nah' });
    const fern = szenario({
      id: 'fern',
      wasserBaender: serialiseWasserBaender([
        {
          tiefeM: 0,
          ringe: [
            [
              [47.5, 16.2],
              [47.51, 16.2],
              [47.51, 16.21],
              [47.5, 16.2],
            ],
          ],
        },
      ]),
    });
    const sorted = wasserstandeFuerLinie(
      [fern, nah],
      [
        [47.945, 16.845],
        [47.9451, 16.8451],
      ]
    );
    expect(sorted[0].id).toBe('nah');
  });

  it('ohne Basishöhe gibt es keinen Wasserstand', () => {
    const result = dammHoeheAusWasserstand({
      item: linie(),
      szenario: szenario({ wasserBasisHoehe: undefined }),
      samples: [{ position: [47.945, 16.845], heightM: 114 }],
      freibord: 0.3,
    });
    expect(result.dammHoehe).toBeUndefined();
    expect(result.keinWasserstand).toBe(true);
  });
});
