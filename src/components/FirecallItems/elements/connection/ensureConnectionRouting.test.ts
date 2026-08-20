// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LatLngPosition } from '../../../../common/geo';
import type { Connection } from '../../../firebase/firestore';

vi.mock('../../../firebase/firebase', () => ({
  default: {},
  firestore: { type: 'mock-firestore' },
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((...args: unknown[]) => ({
    path: args.filter((a) => typeof a === 'string').join('/'),
  })),
}));

const setDoc = vi.fn(() => Promise.resolve());
vi.mock('../../../../lib/firestoreClient', () => ({
  setDoc: (...args: unknown[]) => setDoc(...(args as [])),
}));

const computeStreetRoutedPositions = vi.fn();
vi.mock('./streetRoutingAction', () => ({
  computeStreetRoutedPositions: (...args: unknown[]) =>
    computeStreetRoutedPositions(...(args as [])),
}));

import { positionsSignature } from './routedPath';
import { ensureConnectionRouting } from './ensureConnectionRouting';

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
    routedFor: positionsSignature(points),
    ...overrides,
  });

describe('ensureConnectionRouting', () => {
  beforeEach(() => {
    setDoc.mockClear();
    computeStreetRoutedPositions.mockReset();
  });

  const writtenValue = () => (setDoc.mock.calls[0] as unknown[])[1] as any;

  it('speichert Geometrie, Signatur und die Länge der gerouteten Strecke', async () => {
    computeStreetRoutedPositions.mockResolvedValue(routed);

    await ensureConnectionRouting('einsatz-1', connection({ streetRouting: 'true' }));

    expect(computeStreetRoutedPositions).toHaveBeenCalledWith(
      'einsatz-1',
      points
    );
    const value = writtenValue();
    expect(JSON.parse(value.routedPositions)).toEqual(routed);
    expect(value.routedFor).toBe(positionsSignature(points));
    expect(value.routingFailed).toBe('');
    // Der Straßenverlauf ist länger als die Luftlinie zwischen den Punkten.
    expect(value.distance).toBeGreaterThan(0);
  });

  it('fällt auf die Luftlinie zurück und weist das aus', async () => {
    computeStreetRoutedPositions.mockResolvedValue(undefined);

    await ensureConnectionRouting('einsatz-1', connection({ streetRouting: 'true' }));

    const value = writtenValue();
    expect(value.routingFailed).toBe('true');
    expect(value.routedPositions).toBe('');
    // Die Leitung bleibt bestehen und trägt die Luftlinien-Länge.
    expect(value.distance).toBeGreaterThan(0);
  });

  it('räumt beim Abschalten Geometrie und Kennzeichnung weg', async () => {
    await ensureConnectionRouting(
      'einsatz-1',
      routedConnection({ streetRouting: 'false' })
    );

    expect(computeStreetRoutedPositions).not.toHaveBeenCalled();
    const value = writtenValue();
    expect(value.routedPositions).toBe('');
    expect(value.routedFor).toBe('');
    expect(value.routingFailed).toBe('');
  });

  it('schreibt nichts, wenn es nichts zu tun gibt', async () => {
    await ensureConnectionRouting('einsatz-1', routedConnection());

    expect(computeStreetRoutedPositions).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('gibt einen Fehler der Action nicht weiter', async () => {
    // Das Routing hängt an einer Mutation der Leitung — ein Ausfall darf die
    // schon gespeicherte Änderung nicht als Fehler erscheinen lassen.
    computeStreetRoutedPositions.mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      ensureConnectionRouting('einsatz-1', connection({ streetRouting: 'true' }))
    ).resolves.toBeUndefined();
  });
});
