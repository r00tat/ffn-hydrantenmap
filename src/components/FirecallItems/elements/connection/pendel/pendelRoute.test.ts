// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { LatLngPosition } from '../../../../../common/geo';
import type { Connection } from '../../../../firebase/firestore';
import { calculateDistance } from '../distance';
import { routingSignature } from '../routedPath';
import {
  DETOUR_FACTOR,
  isPendelRoutingFallback,
  pendelDistance,
  pendelEndpoints,
  pendelRoutedPositions,
  pendelRoutingSignature,
  pendelRoutingTodo,
  versorgungsart,
} from './pendelRoute';

const hydrant: LatLngPosition = [47.9482, 16.8482];
const mitte: LatLngPosition = [47.9491, 16.8497];
const einsatzstelle: LatLngPosition = [47.9502, 16.8512];
const points: LatLngPosition[] = [hydrant, mitte, einsatzstelle];

/** Was die Action für die Fahrt zurückgibt — über die Straße, nicht direkt. */
const fahrRoute: LatLngPosition[] = [
  hydrant,
  [47.9478, 16.8494],
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

const routedConnection = (overrides: Partial<Connection> = {}) =>
  connection({
    pendelRoutedPositions: JSON.stringify(fahrRoute),
    pendelRoutedFor: routingSignature([hydrant, einsatzstelle], 'drive'),
    ...overrides,
  });

describe('versorgungsart', () => {
  it('nimmt alles Unbekannte als Förderung', () => {
    // Der Stand vor #693: Leitungen ohne das Feld sind Förderungsrechnungen.
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

describe('pendelEndpoints', () => {
  it('nimmt nur die Enden, nicht die Punkte dazwischen', () => {
    expect(pendelEndpoints(connection())).toEqual([hydrant, einsatzstelle]);
  });

  it('folgt der Förderrichtung', () => {
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

describe('pendelRoutingSignature', () => {
  it('hängt nur an den Enden — ein Zwischenpunkt löst kein Routing aus', () => {
    const verschoben = connection({
      positions: JSON.stringify([hydrant, [47.9495, 16.8503], einsatzstelle]),
    });
    expect(pendelRoutingSignature(verschoben)).toBe(
      pendelRoutingSignature(connection())
    );
    expect(pendelRoutingTodo(routedConnection())).toBe('none');
    expect(
      pendelRoutingTodo(
        routedConnection({
          positions: JSON.stringify([hydrant, [47.9495, 16.8503], einsatzstelle]),
        })
      )
    ).toBe('none');
  });

  it('ändert sich, wenn ein Ende wandert', () => {
    const verschoben = connection({
      positions: JSON.stringify([hydrant, mitte, [47.9600, 16.8600]]),
    });
    expect(pendelRoutingSignature(verschoben)).not.toBe(
      pendelRoutingSignature(connection())
    );
    expect(pendelRoutingTodo(routedConnection(verschoben))).toBe('route');
  });

  it('unterscheidet die Förderrichtung', () => {
    // Hin und zurück sind auf der Straße nicht dieselbe Fahrt.
    expect(
      pendelRoutingSignature(connection({ foerderungUmgekehrt: 'true' }))
    ).not.toBe(pendelRoutingSignature(connection()));
  });
});

describe('pendelRoutingTodo', () => {
  it('routet nicht, solange nur die Förderung gerechnet wird', () => {
    expect(
      pendelRoutingTodo(connection({ versorgungsart: 'foerderung' }))
    ).toBe('none');
  });

  it('räumt eine gespeicherte Route auf, wenn der Pendelverkehr abgewählt wird', () => {
    expect(
      pendelRoutingTodo(routedConnection({ versorgungsart: 'foerderung' }))
    ).toBe('clear');
  });

  it('routet auch für den Vergleich', () => {
    expect(pendelRoutingTodo(connection({ versorgungsart: 'vergleich' }))).toBe(
      'route'
    );
  });

  it('versucht ein gescheitertes Routing nicht erneut', () => {
    const gescheitert = connection({
      pendelRoutingFailed: 'true',
      pendelRoutedFor: routingSignature([hydrant, einsatzstelle], 'drive'),
    });
    expect(pendelRoutingTodo(gescheitert)).toBe('none');
    expect(isPendelRoutingFallback(gescheitert)).toBe(true);
  });

  it('versucht es nach einem verschobenen Ende wieder', () => {
    const gescheitert = connection({
      pendelRoutingFailed: 'true',
      pendelRoutedFor: routingSignature([hydrant, [47.96, 16.86]], 'drive'),
    });
    expect(pendelRoutingTodo(gescheitert)).toBe('route');
    expect(isPendelRoutingFallback(gescheitert)).toBe(false);
  });
});

describe('pendelDistance', () => {
  it('misst die gespeicherte Fahrtroute', () => {
    const item = routedConnection();
    expect(pendelRoutedPositions(item)).toEqual(fahrRoute);
    expect(pendelDistance(item)).toEqual({
      strecke: calculateDistance(fahrRoute),
      source: 'route',
    });
  });

  it('nimmt ohne Route die Luftlinie mit Umwegfaktor und sagt es', () => {
    const result = pendelDistance(connection());
    expect(result?.source).toBe('detour');
    expect(result?.strecke).toBeCloseTo(
      calculateDistance([hydrant, einsatzstelle]) * DETOUR_FACTOR,
      6
    );
  });

  it('misst die Fahrtroute, nicht die Schlauchleitung', () => {
    // Die Leitung führt über den Zwischenpunkt, die Fahrt nicht.
    const item = routedConnection();
    expect(pendelDistance(item)?.strecke).not.toBeCloseTo(
      calculateDistance(points),
      0
    );
  });
});
