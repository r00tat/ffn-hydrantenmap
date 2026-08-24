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

/**
 * Das eigene Höhenmodell wird ersetzt: standardmäßig nicht verfügbar, damit
 * die bestehenden Fälle die Rückfallebene prüfen wie bisher.
 */
const terrainSample = vi.fn();
vi.mock('../../../../../common/terrain/terrainClient', () => ({
  terrainClient: () => ({
    sample: (...args: unknown[]) => terrainSample(...(args as [])),
    contours: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

import {
  elevationSignature,
  FALLBACK_SAMPLE_SPACING_M,
  foerderungSamples,
} from './elevationProfile';

const signature = (samples: Parameters<typeof elevationSignature>[0]) =>
  elevationSignature(samples, FALLBACK_SAMPLE_SPACING_M);
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
    terrainSample.mockReset();
    terrainSample.mockRejectedValue(new Error('kein Worker im Test'));
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
      elevationFor: signature(samples),
      elevationFailed: '',
      elevationSource: 'opentopodata',
      elevationLevel: '',
      elevationSpacing: String(FALLBACK_SAMPLE_SPACING_M),
    });
  });

  it('fragt nicht erneut ab, wenn das Profil zur Lage passt', async () => {
    const item = connection({ foerderung: 'true' });
    const samples = foerderungSamples(item);
    const stored = connection({
      foerderung: 'true',
      elevationProfile: JSON.stringify(samples.map(() => 130)),
      elevationFor: signature(samples),
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
      elevationFor: signature(samples),
      elevationFailed: 'true',
      elevationSource: '',
      elevationLevel: '',
      elevationSpacing: String(FALLBACK_SAMPLE_SPACING_M),
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
        elevationFor: signature(samples),
      })
    );

    expect(fetchElevations).not.toHaveBeenCalled();
    expect(writtenValue()).toEqual({
      elevationProfile: '',
      elevationFor: '',
      elevationFailed: '',
      elevationSource: '',
      elevationLevel: '',
      elevationSpacing: '',
    });
  });

  it('bleibt still, wenn eine Ausnahme aus der Abfrage kommt', async () => {
    fetchElevations.mockRejectedValue(new Error('offline'));
    await expect(
      ensureConnectionElevation('einsatz-1', connection({ foerderung: 'true' }))
    ).resolves.toBeDefined();
    expect(writtenValue().elevationFailed).toBe('true');
  });

  it('nimmt das eigene Höhenmodell und fragt OpenTopoData gar nicht', async () => {
    const item = connection({ foerderung: 'true' });
    const samples = foerderungSamples(item);
    terrainSample.mockResolvedValue(
      samples.map((_, index) => ({ heightM: 130 + index, level: 'detail' }))
    );

    await ensureConnectionElevation('einsatz-1', item);

    expect(terrainSample).toHaveBeenCalledTimes(1);
    expect(fetchElevations).not.toHaveBeenCalled();
    expect(writtenValue()).toEqual({
      elevationProfile: JSON.stringify(samples.map((_, index) => 130 + index)),
      elevationFor: signature(samples),
      elevationFailed: '',
      elevationSource: 'terrain',
      elevationLevel: 'detail',
      elevationSpacing: String(FALLBACK_SAMPLE_SPACING_M),
    });
  });

  it('weist die gröbste gelieferte Stufe aus', async () => {
    const item = connection({ foerderung: 'true' });
    const samples = foerderungSamples(item);
    terrainSample.mockResolvedValue(
      samples.map((_, index) => ({
        heightM: 130,
        // Ein einziger Punkt aus der Übersichtsstufe bestimmt die Angabe: die
        // feinste zu nennen wäre geschmeichelt.
        level: index === 3 ? 'overview' : 'detail',
      }))
    );

    await ensureConnectionElevation('einsatz-1', item);
    expect(writtenValue().elevationLevel).toBe('overview');
  });

  it('weicht bei einer Lücke im eigenen Modell auf OpenTopoData aus', async () => {
    const item = connection({ foerderung: 'true' });
    const samples = foerderungSamples(item);
    terrainSample.mockResolvedValue(
      samples.map((_, index) =>
        // Ein einzelner fehlender Wert macht das ganze Profil ungültig: ein
        // löchriges Profil erzeugt Drücke, die niemand nachprüfen kann.
        index === 2 ? null : { heightM: 130, level: 'detail' }
      )
    );
    fetchElevations.mockResolvedValue(samples.map(() => 200));

    await ensureConnectionElevation('einsatz-1', item);

    expect(fetchElevations).toHaveBeenCalledTimes(1);
    expect(writtenValue().elevationSource).toBe('opentopodata');
    expect(writtenValue().elevationLevel).toBe('');
  });

  it('schreibt nichts ohne Dokument-ID', async () => {
    const { id: _id, ...withoutId } = connection({ foerderung: 'true' });
    await ensureConnectionElevation('einsatz-1', withoutId as Connection);
    expect(setDoc).not.toHaveBeenCalled();
  });
});
