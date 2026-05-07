import { Capacitor } from '@capacitor/core';
import { SampleRateSpec, serializeSampleRateToBridge } from '../radiacode/types';
import { RadiacodeNotification } from '../radiacode/radiacodeNotification';

export interface NativeGpsTrackOpts {
  firecallId: string;
  lineId: string;
  firestoreDb: string;
  creator: string;
  sampleRate: SampleRateSpec;
  initialLat?: number;
  initialLng?: number;
}

// Dasselbe Capacitor-Plugin wie nativeBridge — wir nutzen das zentral registrierte
// Plugin aus radiacodeNotification.ts.
const GpsTrack = RadiacodeNotification;

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

export interface NativeLiveShareOpts {
  firecallId: string;
  uid: string;
  name: string;
  email: string;
  intervalMs: number;
  distanceM: number;
  firecallName: string;
}

export async function nativeStartLiveShare(
  opts: NativeLiveShareOpts,
): Promise<void> {
  const payload: Record<string, unknown> = {
    firecallId: opts.firecallId,
    uid: opts.uid,
    name: opts.name,
    email: opts.email,
    intervalMs: opts.intervalMs,
    distanceM: opts.distanceM,
    firecallName: opts.firecallName,
    firestoreDb: process.env.NEXT_PUBLIC_FIRESTORE_DB || '(default)',
  };
  console.log('[GpsTrack/native] startLiveShare', payload);
  await GpsTrack.startLiveShare(payload);
}

export async function nativeStopLiveShare(): Promise<void> {
  console.log('[GpsTrack/native] stopLiveShare');
  await GpsTrack.stopLiveShare();
}

export async function nativeUpdateLiveShareSettings(opts: {
  intervalMs: number;
  distanceM: number;
}): Promise<void> {
  console.log('[GpsTrack/native] updateLiveShareSettings', opts);
  await GpsTrack.updateLiveShareSettings(opts as Record<string, unknown>);
}
