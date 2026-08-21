// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LatLngPosition } from '../../../../../common/geo';
import type { Connection } from '../../../../firebase/firestore';

vi.mock('../../../../firebase/firebase', () => ({
  default: {},
  firestore: { type: 'mock-firestore' },
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((...args: unknown[]) => ({
    path: args.filter((a) => typeof a === 'string').join('/'),
  })),
}));

const setDoc = vi.fn(() => Promise.resolve());
vi.mock('../../../../../lib/firestoreClient', () => ({
  setDoc: (...args: unknown[]) => setDoc(...(args as [])),
}));

const computeStreetRoutedPositions = vi.fn();
vi.mock('../streetRoutingAction', () => ({
  computeStreetRoutedPositions: (...args: unknown[]) =>
    computeStreetRoutedPositions(...(args as [])),
}));

import { routingSignature } from '../routedPath';
import { ensureConnectionPendelRoute } from './ensureConnectionPendelRoute';

const hydrant: LatLngPosition = [47.9482, 16.8482];
const mitte: LatLngPosition = [47.9491, 16.8497];
const einsatzstelle: LatLngPosition = [47.9502, 16.8512];
const points: LatLngPosition[] = [hydrant, mitte, einsatzstelle];
const fahrRoute: LatLngPosition[] = [
  hydrant,
  [47.9478, 16.8494],
  einsatzstelle,
];

const connection = (overrides: Partial<Connection> = {}): Connection =>
  ({
    id: 'leitung-1',
    type: 'connection',
    lat: hydrant[0],
    lng: hydrant[1],
    destLat: einsatzstelle[0],
    destLng: einsatzstelle[1],
    positions: JSON.stringify(points),
    foerderung: 'true',
    versorgungsart: 'pendel',
    ...overrides,
  }) as Connection;

const written = (): Record<string, string> =>
  (setDoc.mock.calls[0] as unknown as unknown[])?.[1] as Record<string, string>;

describe('ensureConnectionPendelRoute', () => {
  beforeEach(() => {
    setDoc.mockClear();
    computeStreetRoutedPositions.mockReset();
  });

  it('routet nur zwischen den Enden und mit dem Fahrprofil', async () => {
    computeStreetRoutedPositions.mockResolvedValue(fahrRoute);
    await ensureConnectionPendelRoute('einsatz-1', connection());

    expect(computeStreetRoutedPositions).toHaveBeenCalledWith(
      'einsatz-1',
      [hydrant, einsatzstelle],
      'drive'
    );
    expect(written()).toEqual({
      pendelRoutedPositions: JSON.stringify(fahrRoute),
      pendelRoutedFor: routingSignature([hydrant, einsatzstelle], 'drive'),
      pendelRoutingFailed: '',
    });
  });

  it('rührt eine gewöhnliche Förderungsrechnung nicht an', async () => {
    await ensureConnectionPendelRoute(
      'einsatz-1',
      connection({ versorgungsart: 'foerderung' })
    );
    expect(computeStreetRoutedPositions).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('räumt eine gespeicherte Route auf, wenn der Pendelverkehr abgewählt wird', async () => {
    await ensureConnectionPendelRoute(
      'einsatz-1',
      connection({
        versorgungsart: 'foerderung',
        pendelRoutedPositions: JSON.stringify(fahrRoute),
        pendelRoutedFor: routingSignature([hydrant, einsatzstelle], 'drive'),
      })
    );
    expect(computeStreetRoutedPositions).not.toHaveBeenCalled();
    expect(written()).toEqual({
      pendelRoutedPositions: '',
      pendelRoutedFor: '',
      pendelRoutingFailed: '',
    });
  });

  it('hält den Fehlschlag mit Signatur fest, damit er nicht wiederholt wird', async () => {
    computeStreetRoutedPositions.mockResolvedValue(undefined);
    await ensureConnectionPendelRoute('einsatz-1', connection());

    expect(written()).toEqual({
      pendelRoutedPositions: '',
      pendelRoutedFor: routingSignature([hydrant, einsatzstelle], 'drive'),
      pendelRoutingFailed: 'true',
    });
  });

  it('wirft nicht, wenn die Action fehlschlägt', async () => {
    computeStreetRoutedPositions.mockRejectedValue(new Error('kein Netz'));
    await expect(
      ensureConnectionPendelRoute('einsatz-1', connection())
    ).resolves.toBeDefined();
    expect(written().pendelRoutingFailed).toBe('true');
  });

  it('tut ohne id nichts — es gibt kein Dokument zu schreiben', async () => {
    await ensureConnectionPendelRoute(
      'einsatz-1',
      connection({ id: undefined })
    );
    expect(setDoc).not.toHaveBeenCalled();
  });
});
