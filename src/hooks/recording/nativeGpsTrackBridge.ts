import { Capacitor, registerPlugin } from '@capacitor/core';
import { SampleRateSpec, serializeSampleRateToBridge } from '../radiacode/types';

export interface NativeGpsTrackOpts {
  firecallId: string;
  lineId: string;
  firestoreDb: string;
  creator: string;
  sampleRate: SampleRateSpec;
  initialLat?: number;
  initialLng?: number;
}

interface GpsTrackPlugin {
  startGpsTrack(opts: Record<string, unknown>): Promise<void>;
  stopGpsTrack(): Promise<void>;
}

const GpsTrack = registerPlugin<GpsTrackPlugin>('RadiacodeNotification');

export function isNativeGpsTrackingAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === 'android'
  );
}

export async function nativeStartGpsTrack(opts: NativeGpsTrackOpts): Promise<void> {
  const rate = serializeSampleRateToBridge(opts.sampleRate);
  const payload: Record<string, unknown> = {
    firecallId: opts.firecallId,
    lineId: opts.lineId,
    firestoreDb: opts.firestoreDb,
    creator: opts.creator,
    ...rate,
  };
  if (opts.initialLat != null) payload.initialLat = opts.initialLat;
  if (opts.initialLng != null) payload.initialLng = opts.initialLng;
  console.log('[GpsTrack/native] startGpsTrack', payload);
  await GpsTrack.startGpsTrack(payload);
}

export async function nativeStopGpsTrack(): Promise<void> {
  console.log('[GpsTrack/native] stopGpsTrack');
  await GpsTrack.stopGpsTrack();
}
