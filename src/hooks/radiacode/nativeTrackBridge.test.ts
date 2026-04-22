import { describe, expect, it, vi } from 'vitest';

const mockStartTrack = vi.fn().mockResolvedValue(undefined);
const mockStopTrack = vi.fn().mockResolvedValue(undefined);
const mockAddListener = vi.fn().mockImplementation(async () => ({
  remove: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
  },
  registerPlugin: () => ({
    startTrackRecording: mockStartTrack,
    stopTrackRecording: mockStopTrack,
    addListener: mockAddListener,
  }),
}));

describe('nativeTrackBridge', () => {
  it('maps preset track opts to sampleRateKind', async () => {
    const { nativeStartTrack } = await import('./nativeTrackBridge');
    await nativeStartTrack({
      firecallId: 'fc1',
      layerId: 'l1',
      sampleRate: 'normal',
      deviceLabel: 'RC-103 (S1)',
      creator: 'u@x',
      firestoreDb: '',
    });
    expect(mockStartTrack).toHaveBeenCalledWith({
      firecallId: 'fc1',
      layerId: 'l1',
      deviceLabel: 'RC-103 (S1)',
      creator: 'u@x',
      firestoreDb: '',
      sampleRateKind: 'normal',
    });
  });

  it('maps custom track opts to sampleRateKind + custom fields', async () => {
    const { nativeStartTrack } = await import('./nativeTrackBridge');
    await nativeStartTrack({
      firecallId: 'fc1',
      layerId: 'l1',
      sampleRate: { kind: 'custom', intervalSec: 5, doseRateDeltaUSvH: 0.2 },
      deviceLabel: 'RC-103 (S1)',
      creator: 'u@x',
      firestoreDb: '',
    });
    expect(mockStartTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        sampleRateKind: 'custom',
        customIntervalSec: 5,
        customDoseRateDeltaUSvH: 0.2,
      }),
    );
    const payload = mockStartTrack.mock.calls[mockStartTrack.mock.calls.length - 1]![0] as Record<string, unknown>;
    expect(payload.customDistanceM).toBeUndefined();
  });

  it('calls the plugin stop method', async () => {
    const { nativeStopTrack } = await import('./nativeTrackBridge');
    await nativeStopTrack();
    expect(mockStopTrack).toHaveBeenCalledTimes(1);
  });

  it('subscribes to markerWritten events', async () => {
    const { onNativeMarkerWritten } = await import('./nativeTrackBridge');
    const cb = vi.fn();
    const unsub = onNativeMarkerWritten(cb);
    // warten bis addListener aufgerufen
    await new Promise((r) => setTimeout(r, 0));
    expect(mockAddListener).toHaveBeenCalledWith('markerWritten', expect.any(Function));
    // Event-Payload
    const handler = mockAddListener.mock.calls[mockAddListener.mock.calls.length - 1]![1] as (e: unknown) => void;
    handler({ docId: 'd1', layerId: 'l1', lat: 48, lng: 16, timestampMs: 1000, dosisleistungUSvH: 0.1, cps: 5 });
    expect(cb).toHaveBeenCalledWith({
      docId: 'd1', layerId: 'l1', lat: 48, lng: 16,
      timestampMs: 1000, dosisleistungUSvH: 0.1, cps: 5,
    });
    unsub();
  });
});
