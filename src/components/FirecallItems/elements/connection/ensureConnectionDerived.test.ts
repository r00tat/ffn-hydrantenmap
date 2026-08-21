// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Connection } from '../../../firebase/firestore';

const ensureConnectionRouting = vi.fn();
vi.mock('./ensureConnectionRouting', () => ({
  ensureConnectionRouting: (...args: unknown[]) =>
    ensureConnectionRouting(...(args as [])),
}));

const ensureConnectionElevation = vi.fn();
vi.mock('./foerderung/ensureConnectionElevation', () => ({
  ensureConnectionElevation: (...args: unknown[]) =>
    ensureConnectionElevation(...(args as [])),
}));

import { ensureConnectionDerived } from './ensureConnectionDerived';

const connection = (overrides: Partial<Connection> = {}): Connection =>
  ({
    id: 'leitung-1',
    type: 'connection',
    lat: 47.9482,
    lng: 16.8482,
    destLat: 47.9582,
    destLng: 16.8482,
    ...overrides,
  }) as Connection;

describe('ensureConnectionDerived', () => {
  beforeEach(() => {
    ensureConnectionRouting.mockReset();
    ensureConnectionElevation.mockReset();
    ensureConnectionRouting.mockResolvedValue(undefined);
    ensureConnectionElevation.mockResolvedValue(undefined);
  });

  it('routet zuerst und tastet danach ab', async () => {
    const order: string[] = [];
    ensureConnectionRouting.mockImplementation(async () => {
      order.push('routing');
      return undefined;
    });
    ensureConnectionElevation.mockImplementation(async () => {
      order.push('elevation');
      return undefined;
    });

    await ensureConnectionDerived('einsatz-1', connection());

    expect(order).toEqual(['routing', 'elevation']);
  });

  it('gibt dem Höhenprofil die vom Routing geschriebene Geometrie mit', async () => {
    // Ohne das Zusammenführen tastete das Profil die Luftlinie ab, während die
    // Karte den Straßenverlauf zeichnet.
    ensureConnectionRouting.mockResolvedValue({
      routedPositions: '[[47.9482,16.8482],[47.9582,16.8482]]',
      routedFor: 'walk:[[47.9482,16.8482],[47.9582,16.8482]]',
      routingFailed: '',
      distance: 1113,
    });

    await ensureConnectionDerived('einsatz-1', connection());

    expect(ensureConnectionElevation).toHaveBeenCalledWith(
      'einsatz-1',
      expect.objectContaining({
        id: 'leitung-1',
        routedPositions: '[[47.9482,16.8482],[47.9582,16.8482]]',
        distance: 1113,
      })
    );
  });

  it('tastet auch ab, wenn das Routing nichts geschrieben hat', async () => {
    await ensureConnectionDerived('einsatz-1', connection());
    expect(ensureConnectionElevation).toHaveBeenCalledWith(
      'einsatz-1',
      expect.objectContaining({ id: 'leitung-1' })
    );
  });
});
