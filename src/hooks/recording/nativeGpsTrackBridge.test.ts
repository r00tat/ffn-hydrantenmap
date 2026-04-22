import { describe, it, expect, vi, beforeEach } from 'vitest';

const startGpsTrack = vi.fn().mockResolvedValue(undefined);
const stopGpsTrack = vi.fn().mockResolvedValue(undefined);

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
  registerPlugin: () => ({ startGpsTrack, stopGpsTrack }),
}));

beforeEach(() => {
  startGpsTrack.mockClear();
  stopGpsTrack.mockClear();
});

describe('nativeGpsTrackBridge', () => {
  it('forwards preset sampleRate', async () => {
    const { nativeStartGpsTrack } = await import('./nativeGpsTrackBridge');
    await nativeStartGpsTrack({
      firecallId: 'f',
      lineId: 'l',
      firestoreDb: '',
      creator: 'me',
      sampleRate: 'normal',
    });
    expect(startGpsTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        firecallId: 'f',
        lineId: 'l',
        sampleRateKind: 'normal',
      }),
    );
  });

  it('forwards custom sampleRate with only provided fields', async () => {
    const { nativeStartGpsTrack } = await import('./nativeGpsTrackBridge');
    await nativeStartGpsTrack({
      firecallId: 'f',
      lineId: 'l',
      firestoreDb: '',
      creator: 'me',
      sampleRate: { kind: 'custom', intervalSec: 10 },
    });
    expect(startGpsTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        sampleRateKind: 'custom',
        customIntervalSec: 10,
      }),
    );
    const arg = startGpsTrack.mock.calls[startGpsTrack.mock.calls.length - 1]![0] as Record<string, unknown>;
    expect(arg.customDistanceM).toBeUndefined();
    expect(arg.customDoseRateDeltaUSvH).toBeUndefined();
  });

  it('passes initial position when provided', async () => {
    const { nativeStartGpsTrack } = await import('./nativeGpsTrackBridge');
    await nativeStartGpsTrack({
      firecallId: 'f',
      lineId: 'l',
      firestoreDb: '',
      creator: 'me',
      sampleRate: 'normal',
      initialLat: 47.0,
      initialLng: 16.0,
    });
    expect(startGpsTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        initialLat: 47.0,
        initialLng: 16.0,
      }),
    );
  });

  it('stopGpsTrack delegates', async () => {
    const { nativeStopGpsTrack } = await import('./nativeGpsTrackBridge');
    await nativeStopGpsTrack();
    expect(stopGpsTrack).toHaveBeenCalledTimes(1);
  });
});
