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

const fetchElevations = vi.fn();
vi.mock('./elevationAction', () => ({
  fetchElevations: (...args: unknown[]) => fetchElevations(...(args as [])),
}));

import { elevationSignature, foerderungSamples } from './elevationProfile';
import { ensureConnectionElevation } from './ensureConnectionElevation';

const entnahme: LatLngPosition = [47.9482, 16.8482];
const verteiler: LatLngPosition = [47.9582, 16.8482];
const points: LatLngPosition[] = [entnahme, verteiler];

const connection = (overrides: Partial<Connection> = {}): Connection =>
  ({
    id: 'leitung-1',
    type: 'connection',
    name: 'Zubringleitung',
    lat: entnahme[0],
    lng: entnahme[1],
    destLat: verteiler[0],
    destLng: verteiler[1],
    positions: JSON.stringify(points),
    dimension: 'B',
    ...overrides,
  }) as Connection;

const writtenValue = () => (setDoc.mock.calls[0] as unknown[])[1] as any;

describe('ensureConnectionElevation', () => {
  beforeEach(() => {
    setDoc.mockClear();
    fetchElevations.mockReset();
  });

  it('schreibt nichts ohne aktiven Rechner', async () => {
    await ensureConnectionElevation('einsatz-1', connection());
    expect(fetchElevations).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('fragt die Höhen ab und speichert sie mit ihrer Signatur', async () => {
    const item = connection({ foerderung: 'true' });
    const samples = foerderungSamples(item);
    fetchElevations.mockResolvedValue(samples.map((_, index) => 130 + index));

    await ensureConnectionElevation('einsatz-1', item);

    expect(fetchElevations).toHaveBeenCalledTimes(1);
    expect(writtenValue()).toEqual({
      elevationProfile: JSON.stringify(samples.map((_, index) => 130 + index)),
      elevationFor: elevationSignature(samples),
      elevationFailed: '',
    });
  });

  it('fragt nicht erneut ab, wenn das Profil zur Lage passt', async () => {
    const item = connection({ foerderung: 'true' });
    const samples = foerderungSamples(item);
    const stored = connection({
      foerderung: 'true',
      elevationProfile: JSON.stringify(samples.map(() => 130)),
      elevationFor: elevationSignature(samples),
    });

    await ensureConnectionElevation('einsatz-1', stored);

    expect(fetchElevations).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('merkt sich einen Fehlschlag, damit er nicht bei jeder Änderung neu versucht wird', async () => {
    const item = connection({ foerderung: 'true' });
    const samples = foerderungSamples(item);
    fetchElevations.mockResolvedValue(undefined);

    await ensureConnectionElevation('einsatz-1', item);

    const written = writtenValue();
    expect(written).toEqual({
      elevationProfile: '',
      elevationFor: elevationSignature(samples),
      elevationFailed: 'true',
    });

    // Zweiter Aufruf mit dem gespeicherten Fehlschlag: keine neue Abfrage.
    setDoc.mockClear();
    fetchElevations.mockClear();
    await ensureConnectionElevation(
      'einsatz-1',
      connection({ foerderung: 'true', ...written })
    );
    expect(fetchElevations).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('leert die Felder, wenn der Rechner abgeschaltet wird', async () => {
    const item = connection({ foerderung: 'true' });
    const samples = foerderungSamples(item);

    await ensureConnectionElevation(
      'einsatz-1',
      connection({
        foerderung: 'false',
        elevationProfile: JSON.stringify(samples.map(() => 130)),
        elevationFor: elevationSignature(samples),
      })
    );

    expect(fetchElevations).not.toHaveBeenCalled();
    expect(writtenValue()).toEqual({
      elevationProfile: '',
      elevationFor: '',
      elevationFailed: '',
    });
  });

  it('bleibt still, wenn eine Ausnahme aus der Abfrage kommt', async () => {
    fetchElevations.mockRejectedValue(new Error('offline'));
    await expect(
      ensureConnectionElevation('einsatz-1', connection({ foerderung: 'true' }))
    ).resolves.toBeDefined();
    expect(writtenValue().elevationFailed).toBe('true');
  });

  it('schreibt nichts ohne Dokument-ID', async () => {
    const { id: _id, ...withoutId } = connection({ foerderung: 'true' });
    await ensureConnectionElevation('einsatz-1', withoutId as Connection);
    expect(setDoc).not.toHaveBeenCalled();
  });
});
