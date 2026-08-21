// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { LatLngPosition } from '../../../../common/geo';
import type { Connection } from '../../../firebase/firestore';
import { routingSignature } from './routedPath';
import { versorgungSummary } from './versorgungSummary';

const hydrant: LatLngPosition = [47.9482, 16.8482];
const einsatzstelle: LatLngPosition = [47.9502, 16.8512];
const points: LatLngPosition[] = [hydrant, einsatzstelle];

const connection = (overrides: Partial<Connection> = {}): Connection =>
  ({
    id: 'leitung-1',
    type: 'connection',
    lat: hydrant[0],
    lng: hydrant[1],
    destLat: einsatzstelle[0],
    destLng: einsatzstelle[1],
    positions: JSON.stringify(points),
    dimension: 'B',
    oneHozeLength: 20,
    foerderung: 'true',
    hoehenunterschied: 0,
    pendelRoutedPositions: JSON.stringify(points),
    pendelRoutedFor: routingSignature([hydrant, einsatzstelle], 'drive'),
    ...overrides,
  }) as Connection;

describe('versorgungSummary', () => {
  it('nennt bei Förderung die Verstärkerpumpen', () => {
    const summary = versorgungSummary(connection());
    expect(summary).toMatch(/Förderung/);
    expect(summary).toMatch(/Verstärkerpumpe/);
  });

  it('nennt bei Pendelverkehr Fahrzeuge und Menge', () => {
    const summary = versorgungSummary(
      connection({ versorgungsart: 'pendel', pendelFahrzeuge: 3 })
    );
    expect(summary).toMatch(/Pendelverkehr/);
    expect(summary).toMatch(/3 Fz/);
    expect(summary).toMatch(/l\/min/);
  });

  it('nennt im Vergleich die Empfehlung, nicht beide Mengen', () => {
    // Kurze Leitung, kleine Sollmenge: Die Förderung ist hier schneller
    // aufgebaut als ein Umlauf dauert.
    const summary = versorgungSummary(
      connection({ versorgungsart: 'vergleich', foerderMenge: 400 })
    );
    expect(summary).toMatch(/Vergleich/);
    expect(summary).not.toMatch(/Verstärkerpumpe/);
  });

  it('schweigt ohne eingeschalteten Rechner', () => {
    expect(versorgungSummary(connection({ foerderung: 'false' }))).toBeUndefined();
  });
});
