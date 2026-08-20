// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { LatLngPosition } from '../../../common/geo';
import type { Connection } from '../../firebase/firestore';

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({}));
vi.mock('next-auth', () => ({
  default: vi.fn(() => ({
    handlers: {},
    signIn: vi.fn(),
    signOut: vi.fn(),
    auth: vi.fn(),
  })),
}));
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({ data: null, status: 'unauthenticated' })),
  signOut: vi.fn(),
}));
vi.mock('../../../components/firebase/firebase', () => ({
  firestore: {},
}));
vi.mock('../../../hooks/useMapEditor', () => ({
  useMapEditable: vi.fn(() => false),
}));

import { routingSignature } from './connection/routedPath';
import { FirecallConnection } from './FirecallConnection';

const hydrant: LatLngPosition = [47.9482, 16.8482];
const rohr: LatLngPosition = [47.9502, 16.8512];
const points: LatLngPosition[] = [hydrant, rohr];
/** Straßenverlauf mit Zuführung — deutlich länger als die Luftlinie. */
const routed: LatLngPosition[] = [
  hydrant,
  [47.9484, 16.8486],
  [47.949, 16.853],
  [47.9499, 16.8509],
  rohr,
];

const connection = (overrides: Partial<Connection> = {}) =>
  new FirecallConnection({
    id: 'leitung-1',
    type: 'connection',
    name: 'Zubringleitung',
    lat: hydrant[0],
    lng: hydrant[1],
    destLat: rohr[0],
    destLng: rohr[1],
    positions: JSON.stringify(points),
    distance: 260,
    ...overrides,
  } as Connection);

describe('FirecallConnection', () => {
  it('bietet das Straßen-Routing als Feld an', () => {
    const item = connection();
    expect(item.fields().streetRouting).toBeTruthy();
    expect(item.fieldTypes().streetRouting).toBe('boolean');
  });

  it('trägt Option und geroutete Geometrie durch das Speichern', () => {
    // `data()` ist die Grundlage jedes Schreibvorgangs — was hier fehlt, löscht
    // ein Speichern aus dem Dialog (setDoc ohne merge).
    const data = connection({
      streetRouting: 'true',
      routedPositions: JSON.stringify(routed),
      routedFor: routingSignature(points, 'walk'),
      routingFailed: 'false',
    }).data();

    expect(data.streetRouting).toBe('true');
    expect(JSON.parse(data.routedPositions || '[]')).toEqual(routed);
    expect(data.routedFor).toBe(routingSignature(points, 'walk'));
    expect(data.routingFailed).toBe('false');
  });

  it('zeichnet ohne die Option die direkte Verbindung', () => {
    expect(connection().displayPositions()).toEqual(points);
  });

  it('zeichnet mit der Option den gespeicherten Straßenverlauf', () => {
    expect(
      connection({
        streetRouting: 'true',
        routedPositions: JSON.stringify(routed),
        routedFor: routingSignature(points, 'walk'),
      }).displayPositions()
    ).toEqual(routed);
  });

  it('rechnet die Schlauchlängen aus der gespeicherten Länge', () => {
    // 260 m auf 20-m-Schläuche sind 13 Längen.
    const item = connection({ dimension: 'B', oneHozeLength: 20 });
    expect(item.info()).toContain('260m');
    expect(item.info()).toContain('13 B-Längen');
  });

  it('weist die Luftlinie aus, wenn das Routing ausgefallen ist', () => {
    // Ohne den Hinweis wird eine zu kurze Meterangabe für die Wahrheit
    // genommen — und es fehlen Schläuche.
    const item = connection({
      streetRouting: 'true',
      routingFailed: 'true',
      routedFor: routingSignature(points, 'walk'),
    });
    expect(item.info()).toContain('Luftlinie');
  });

  it('weist nichts aus, solange das Routing trägt', () => {
    const item = connection({
      streetRouting: 'true',
      routedPositions: JSON.stringify(routed),
      routedFor: routingSignature(points, 'walk'),
    });
    expect(item.info()).not.toContain('Luftlinie');
  });
});
