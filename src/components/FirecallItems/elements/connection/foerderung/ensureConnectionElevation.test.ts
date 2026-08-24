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

import { elevationSignature, foerderungSamples } from './elevationProfile';
import { FALLBACK_SAMPLING, FINE_SAMPLING } from './elevationSampling';

/**
 * Jede Quelle hat ihre eigene Abtastung, und gespeichert wird die Signatur der
 * tatsächlich verwendeten. Die Tests bilden das nach, statt eine gemeinsame
 * Weite zu unterstellen.
 */
const fineSamples = (item: Parameters<typeof foerderungSamples>[0]) =>
  foerderungSamples(item, FINE_SAMPLING);
const coarseSamples = (item: Parameters<typeof foerderungSamples>[0]) =>
  foerderungSamples(item, FALLBACK_SAMPLING);
const fineSignature = (samples: Parameters<typeof elevationSignature>[0]) =>
  elevationSignature(samples, FINE_SAMPLING.spacingM);
const coarseSignature = (samples: Parameters<typeof elevationSignature>[0]) =>
  elevationSignature(samples, FALLBACK_SAMPLING.spacingM);
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
    const samples = coarseSamples(item);
    fetchElevations.mockResolvedValue(samples.map((_, index) => 130 + index));

    await ensureConnectionElevation('einsatz-1', item);

    expect(fetchElevations).toHaveBeenCalledTimes(1);
    expect(writtenValue()).toEqual({
      elevationProfile: JSON.stringify(samples.map((_, index) => 130 + index)),
      elevationFor: coarseSignature(samples),
      elevationFailed: '',
      elevationSource: 'opentopodata',
      elevationLevel: '',
      elevationSpacing: String(FALLBACK_SAMPLING.spacingM),
    });
  });

  it('fragt nicht erneut ab, wenn das Profil zur Lage passt', async () => {
    const item = connection({ foerderung: 'true' });
    const samples = fineSamples(item);
    const stored = connection({
      foerderung: 'true',
      elevationProfile: JSON.stringify(samples.map(() => 130)),
      elevationFor: fineSignature(samples),
      elevationSpacing: String(FINE_SAMPLING.spacingM),
    });

    await ensureConnectionElevation('einsatz-1', stored);

    expect(fetchElevations).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('merkt sich einen Fehlschlag, damit er nicht bei jeder Änderung neu versucht wird', async () => {
    const item = connection({ foerderung: 'true' });
    // Der Fehlschlag hält die Signatur des letzten Versuchs fest, und das ist
    // die Rückfallebene.
    const samples = coarseSamples(item);
    fetchElevations.mockResolvedValue(undefined);

    await ensureConnectionElevation('einsatz-1', item);

    const written = writtenValue();
    expect(written).toEqual({
      elevationProfile: '',
      elevationFor: coarseSignature(samples),
      elevationFailed: 'true',
      elevationSource: '',
      elevationLevel: '',
      elevationSpacing: String(FALLBACK_SAMPLING.spacingM),
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
    const samples = fineSamples(item);

    await ensureConnectionElevation(
      'einsatz-1',
      connection({
        foerderung: 'false',
        elevationProfile: JSON.stringify(samples.map(() => 130)),
        elevationFor: fineSignature(samples),
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
    const samples = fineSamples(item);
    terrainSample.mockResolvedValue(
      samples.map((_, index) => ({ heightM: 130 + index, level: 'detail' }))
    );

    await ensureConnectionElevation('einsatz-1', item);

    expect(terrainSample).toHaveBeenCalledTimes(1);
    // Feiner abgetastet als die Rückfallebene: das ist der Zweck des eigenen
    // Modells.
    expect(samples.length).toBeGreaterThan(coarseSamples(item).length);
    expect(fetchElevations).not.toHaveBeenCalled();
    expect(writtenValue()).toEqual({
      elevationProfile: JSON.stringify(samples.map((_, index) => 130 + index)),
      elevationFor: fineSignature(samples),
      elevationFailed: '',
      elevationSource: 'terrain',
      elevationLevel: 'detail',
      elevationSpacing: String(FINE_SAMPLING.spacingM),
    });
  });

  it('weist die gröbste gelieferte Stufe aus', async () => {
    const item = connection({ foerderung: 'true' });
    const samples = fineSamples(item);
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
    terrainSample.mockResolvedValue(
      fineSamples(item).map((_, index) =>
        // Ein einzelner fehlender Wert macht das ganze Profil ungültig: ein
        // löchriges Profil erzeugt Drücke, die niemand nachprüfen kann.
        index === 2 ? null : { heightM: 130, level: 'detail' }
      )
    );
    const coarse = coarseSamples(item);
    fetchElevations.mockResolvedValue(coarse.map(() => 200));

    await ensureConnectionElevation('einsatz-1', item);

    expect(fetchElevations).toHaveBeenCalledTimes(1);
    expect(writtenValue().elevationSource).toBe('opentopodata');
    expect(writtenValue().elevationLevel).toBe('');
    // Die Rückfallebene bekommt ihre eigene, gröbere Abtastung — und die
    // Signatur gehört zu ihr, nicht zu der Abtastung, mit der es das eigene
    // Modell versucht hat.
    expect(writtenValue().elevationSpacing).toBe(
      String(FALLBACK_SAMPLING.spacingM)
    );
    expect(writtenValue().elevationFor).toBe(coarseSignature(coarse));
  });

  it('schreibt nichts ohne Dokument-ID', async () => {
    const { id: _id, ...withoutId } = connection({ foerderung: 'true' });
    await ensureConnectionElevation('einsatz-1', withoutId as Connection);
    expect(setDoc).not.toHaveBeenCalled();
  });
});
