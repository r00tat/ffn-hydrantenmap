import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { SampleRatePreset, SampleRateSpec, serializeSampleRateToBridge } from './types';
import { MarkerWrittenEvent, RadiacodeNotification } from './radiacodeNotification';

export type NativeSampleRate = SampleRatePreset;

export interface NativeTrackOpts {
  firecallId: string;
  layerId: string;
  sampleRate: SampleRateSpec;
  deviceLabel: string;
  creator: string;
  firestoreDb: string;
}

// Dasselbe Capacitor-Plugin wie nativeBridge — wir nutzen das zentral registrierte
// Plugin aus radiacodeNotification.ts.
const RadiacodeTrack = RadiacodeNotification;

export type Unsubscribe = () => void;

export function isNativeTrackingAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === 'android'
  );
}

export async function nativeStartTrack(opts: NativeTrackOpts): Promise<void> {
  const rate = serializeSampleRateToBridge(opts.sampleRate);
  const payload: Record<string, unknown> = {
    firecallId: opts.firecallId,
    layerId: opts.layerId,
    deviceLabel: opts.deviceLabel,
    creator: opts.creator,
    firestoreDb: opts.firestoreDb,
    ...rate,
  };
  console.log('[Radiacode/nativeTrackBridge] startTrack', payload);
  await RadiacodeTrack.startTrackRecording(payload);
}

export async function nativeStopTrack(): Promise<void> {
  console.log('[Radiacode/nativeTrackBridge] stopTrack');
  await RadiacodeTrack.stopTrackRecording();
}

export function onNativeMarkerWritten(
  handler: (e: MarkerWrittenEvent) => void,
): Unsubscribe {
  let listenerHandle: PluginListenerHandle | null = null;
  let unsubscribed = false;
  RadiacodeTrack.addListener('markerWritten', (e) => handler(e))
    .then((h) => {
      if (unsubscribed) {
        void h.remove();
      } else {
        listenerHandle = h;
      }
    })
    .catch(() => {});
  return () => {
    unsubscribed = true;
    listenerHandle?.remove().catch(() => {});
  };
}
