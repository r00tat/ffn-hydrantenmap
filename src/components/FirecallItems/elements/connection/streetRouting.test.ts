// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { LatLngPosition } from '../../../../common/geo';
import type { Connection } from '../../../firebase/firestore';

import { routingSignature } from './routedPath';
import { connectionDisplayPositions, routingTodo } from './streetRouting';

const hydrant: LatLngPosition = [47.9482, 16.8482];
const verteiler: LatLngPosition = [47.9502, 16.8512];
const points: LatLngPosition[] = [hydrant, verteiler];
/** Der Straßenverlauf inklusive Zuführung — was die Action zurückgibt. */
const routed: LatLngPosition[] = [
  hydrant,
  [47.9484, 16.8486],
  [47.9499, 16.8509],
  verteiler,
];

const connection = (overrides: Partial<Connection> = {}): Connection =>
  ({
    id: 'leitung-1',
    type: 'connection',
    name: 'Zubringleitung',
    lat: hydrant[0],
    lng: hydrant[1],
    destLat: verteiler[0],
    destLng: verteiler[1],
    positions: JSON.stringify(points),
    ...overrides,
  }) as Connection;

const routedConnection = (overrides: Partial<Connection> = {}) =>
  connection({
    streetRouting: 'true',
    routedPositions: JSON.stringify(routed),
    routedFor: routingSignature(points, 'walk'),
    ...overrides,
  });

describe('routingTodo', () => {
  it('lässt Elementtypen ohne die Option unberührt', () => {
    // Eine Fläche hat keinen Verlauf, den man routen könnte.
    expect(
      routingTodo(connection({ type: 'area' as Connection['type'] }))
    ).toBe('none');
  });

  it('gilt auch für die normale Linie', () => {
    expect(
      routingTodo(
        connection({
          type: 'line' as Connection['type'],
          streetRouting: 'true',
        })
      )
    ).toBe('route');
  });

  it('routet neu, wenn das Profil gewechselt wird', () => {
    // Von Fuß auf Auto ändert die Route, ohne dass ein Punkt bewegt wurde.
    expect(
      routingTodo(
        routedConnection({
          type: 'line' as Connection['type'],
          routingProfile: 'drive',
        })
      )
    ).toBe('route');
  });

  it('tut ohne die Option nichts', () => {
    expect(routingTodo(connection())).toBe('none');
  });

  it('räumt die Geometrie auf, wenn die Option abgeschaltet wird', () => {
    // Sonst blieben Linie und Meterangabe auf dem gerouteten Stand stehen,
    // obwohl die Leitung wieder Luftlinie sein soll.
    expect(routingTodo(routedConnection({ streetRouting: 'false' }))).toBe(
      'clear'
    );
  });

  it('routet, sobald die Option gesetzt ist', () => {
    expect(routingTodo(connection({ streetRouting: 'true' }))).toBe('route');
  });

  it('routet nicht erneut, wenn die Geometrie zu den Punkten passt', () => {
    // Der Grund, aus dem die Geometrie überhaupt gespeichert wird: kein Aufruf
    // pro Render.
    expect(routingTodo(routedConnection())).toBe('none');
  });

  it('routet neu, wenn ein Punkt verschoben wurde', () => {
    const moved: LatLngPosition[] = [hydrant, [47.9505, 16.8515]];
    expect(
      routingTodo(
        routedConnection({
          positions: JSON.stringify(moved),
          destLat: moved[1][0],
          destLng: moved[1][1],
        })
      )
    ).toBe('route');
  });

  it('versucht ein gescheitertes Routing für dieselben Punkte nicht wieder', () => {
    expect(
      routingTodo(
        connection({
          streetRouting: 'true',
          routingFailed: 'true',
          routedFor: routingSignature(points, 'walk'),
        })
      )
    ).toBe('none');
  });
});

describe('connectionDisplayPositions', () => {
  it('zeichnet den Straßenverlauf, wenn er zu den Punkten passt', () => {
    expect(connectionDisplayPositions(routedConnection())).toEqual(routed);
  });

  it('zeichnet die Luftlinie, solange die Geometrie veraltet ist', () => {
    // Zwischen Verschieben und Antwort des Routings darf keine Leitung fehlen.
    expect(
      connectionDisplayPositions(routedConnection({ routedFor: 'veraltet' }))
    ).toEqual(points);
  });

  it('zeichnet die Luftlinie ohne die Option', () => {
    expect(
      connectionDisplayPositions(routedConnection({ streetRouting: 'false' }))
    ).toEqual(points);
  });
});
