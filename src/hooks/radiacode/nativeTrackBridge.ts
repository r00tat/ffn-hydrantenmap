import { Capacitor, PluginListenerHandle, registerPlugin } from '@capacitor/core';
import { SampleRatePreset, SampleRateSpec, serializeSampleRateToBridge } from './types';

export type NativeSampleRate = SampleRatePreset;

export interface NativeTrackOpts {
  firecallId: string;
  layerId: string;
  sampleRate: SampleRateSpec;
  deviceLabel: string;
  creator: string;
  firestoreDb: string;
}

export interface MarkerWrittenEvent {
  docId: string;
  layerId: string;
  lat: number;
  lng: number;
  timestampMs: number;
  dosisleistungUSvH: number;
  cps: number;
}

interface RadiacodeTrackPlugin {
  startTrackRecording(opts: Record<string, unknown>): Promise<void>;
  stopTrackRecording(): Promise<void>;
  addListener(
    event: 'markerWritten',
    listener: (data: MarkerWrittenEvent) => void,
  ): Promise<PluginListenerHandle>;
}

// Dasselbe Capacitor-Plugin wie nativeBridge — wir erweitern nur das
// TS-Interface, um die neuen Methoden typisiert zu haben.
const RadiacodeTrack = registerPlugin<RadiacodeTrackPlugin>('RadiacodeNotification');

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
