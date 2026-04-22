import { Capacitor, PluginListenerHandle, registerPlugin } from '@capacitor/core';

export type NativeSampleRate = 'niedrig' | 'normal' | 'hoch';

export interface NativeTrackOpts {
  firecallId: string;
  layerId: string;
  sampleRate: NativeSampleRate;
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
  startTrackRecording(opts: NativeTrackOpts): Promise<void>;
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
  console.log('[Radiacode/nativeTrackBridge] startTrack', opts);
  await RadiacodeTrack.startTrackRecording(opts);
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
