// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { LatLngPosition } from '../../../../../common/geo';
import type { Connection } from '../../../../firebase/firestore';
import { calculateDistance } from '../distance';
import { routingSignature } from '../routedPath';
import {
  isPendelRelevant,
  isVehicleRouted,
  pendelDistance,
  pendelEndpoints,
  versorgungsart,
} from './pendelRoute';

const hydrant: LatLngPosition = [47.9482, 16.8482];
const mitte: LatLngPosition = [47.9491, 16.8497];
const einsatzstelle: LatLngPosition = [47.9502, 16.8512];
const points: LatLngPosition[] = [hydrant, mitte, einsatzstelle];

/** Der geroutete Verlauf — länger als die Luftlinien zwischen den Punkten. */
const routed: LatLngPosition[] = [
  hydrant,
  [47.9478, 16.8494],
  mitte,
  [47.9496, 16.8521],
  einsatzstelle,
];

const connection = (overrides: Partial<Connection> = {}): Connection =>
  ({
    id: 'leitung-1',
    type: 'connection',
    name: 'Zubringleitung',
    lat: hydrant[0],
    lng: hydrant[1],
    destLat: einsatzstelle[0],
    destLng: einsatzstelle[1],
    positions: JSON.stringify(points),
    foerderung: 'true',
    versorgungsart: 'pendel',
    ...overrides,
  }) as Connection;

/** Dieselbe Leitung, auf Fahrzeug-Routing gestellt und geroutet. */
const driveRouted = (overrides: Partial<Connection> = {}) =>
  connection({
    streetRouting: 'true',
    routingProfile: 'drive',
    routedPositions: JSON.stringify(routed),
    routedFor: routingSignature(points, 'drive'),
    ...overrides,
  });

describe('versorgungsart', () => {
  it('nimmt alles Unbekannte als Förderung', () => {
    expect(versorgungsart(connection({ versorgungsart: undefined }))).toBe(
      'foerderung'
    );
    expect(
      versorgungsart(
        connection({ versorgungsart: 'quatsch' as Connection['versorgungsart'] })
      )
    ).toBe('foerderung');
  });

  it('liest Pendelverkehr und Vergleich', () => {
    expect(versorgungsart(connection({ versorgungsart: 'pendel' }))).toBe(
      'pendel'
    );
    expect(versorgungsart(connection({ versorgungsart: 'vergleich' }))).toBe(
      'vergleich'
    );
  });
});

describe('isPendelRelevant', () => {
  it('gilt für Pendelverkehr und Vergleich, nicht für die Förderung', () => {
    expect(isPendelRelevant(connection({ versorgungsart: 'pendel' }))).toBe(true);
    expect(isPendelRelevant(connection({ versorgungsart: 'vergleich' }))).toBe(
      true
    );
    expect(
      isPendelRelevant(connection({ versorgungsart: 'foerderung' }))
    ).toBe(false);
  });

  it('gilt nicht ohne eingeschalteten Rechner', () => {
    expect(isPendelRelevant(connection({ foerderung: 'false' }))).toBe(false);
  });
});

describe('isVehicleRouted', () => {
  it('gilt nur mit Routing und Fahrzeug-Profil', () => {
    expect(isVehicleRouted(driveRouted())).toBe(true);
    expect(isVehicleRouted(connection())).toBe(false);
  });

  it('gilt nicht für das Fußgänger-Profil', () => {
    // Ein Schlauch hält sich nicht an Einbahnen, ein Fahrzeug schon.
    expect(
      isVehicleRouted(
        connection({
          streetRouting: 'true',
          routingProfile: 'walk',
          routedPositions: JSON.stringify(routed),
          routedFor: routingSignature(points, 'walk'),
        })
      )
    ).toBe(false);
  });

  it('gilt nicht, wenn das Routing gescheitert ist', () => {
    expect(
      isVehicleRouted(
        connection({
          streetRouting: 'true',
          routingProfile: 'drive',
          routingFailed: 'true',
          routedFor: routingSignature(points, 'drive'),
        })
      )
    ).toBe(false);
  });
});

describe('pendelEndpoints', () => {
  it('nimmt die Enden in Förderrichtung', () => {
    expect(pendelEndpoints(connection())).toEqual([hydrant, einsatzstelle]);
    expect(
      pendelEndpoints(connection({ foerderungUmgekehrt: 'true' }))
    ).toEqual([einsatzstelle, hydrant]);
  });

  it('gibt ohne zwei brauchbare Punkte nichts zurück', () => {
    expect(
      pendelEndpoints(connection({ positions: JSON.stringify([hydrant]) }))
    ).toBeUndefined();
  });
});

describe('pendelDistance', () => {
  it('misst den gerouteten Verlauf über alle Punkte', () => {
    const item = driveRouted();
    expect(pendelDistance(item)).toEqual({
      strecke: calculateDistance(routed),
      source: 'route',
    });
  });

  it('nimmt ohne Routing die gezeichnete Linie, ohne Aufschlag', () => {
    // Kein Umwegfaktor: Wer die Punkte entlang der Straße setzt, hat den Umweg
    // schon gezeichnet — ein Aufschlag zählte ihn doppelt.
    const result = pendelDistance(connection());
    expect(result).toEqual({
      strecke: calculateDistance(points),
      source: 'drawn',
    });
  });

  it('beachtet die Punkte in der Mitte', () => {
    // Genau das war der Fehler der zweiten Linie: Sie fuhr von Ende zu Ende und
    // ließ die abgesteckten Zwischenpunkte liegen.
    const ueberEck = connection({
      positions: JSON.stringify([hydrant, [47.9460, 16.8530], einsatzstelle]),
    });
    expect(pendelDistance(ueberEck)!.strecke).toBeGreaterThan(
      calculateDistance([hydrant, einsatzstelle]) * 1.2
    );
  });

  it('gibt ohne Linie nichts zurück', () => {
    expect(
      pendelDistance(connection({ positions: JSON.stringify([hydrant]) }))
    ).toBeUndefined();
  });
});
