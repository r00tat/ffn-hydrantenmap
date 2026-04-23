import { registerPlugin, PluginListenerHandle } from '@capacitor/core';

export type NotificationState = 'connected' | 'recording' | 'reconnecting';
export type NativeConnectionState = 'connected' | 'disconnected' | 'reconnecting';

export interface RadiacodeNativeState {
  connected: boolean;
  deviceAddress: string | null;
  radiacodeTracking: boolean;
  gpsTracking: boolean;
}

export interface RadiacodeNotificationUpdate {
  dosisleistung: number;
  cps: number;
  state: NotificationState;
}

export interface NativeMeasurementEvent {
  timestampMs: number;
  dosisleistungUSvH: number;
  cps: number;
  doseUSv?: number;
  durationSec?: number;
  temperatureC?: number;
  chargePct?: number;
  dosisleistungErrPct?: number;
  cpsErrPct?: number;
}

export interface NativeNotificationEvent {
  bytes: string; // base64
}

export interface NativeConnectionStateEvent {
  state: NativeConnectionState;
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

export interface RadiacodeNotificationPlugin {
  // Phase 1: Notification & Lifecycle
  start(opts: { title: string; body: string }): Promise<void>;
  update(opts: RadiacodeNotificationUpdate): Promise<void>;
  stop(): Promise<void>;
  getState(): Promise<RadiacodeNativeState>;

  // Phase 2: BLE Passthrough
  connectNative(opts: { deviceAddress: string }): Promise<void>;
  writeNative(opts: { payload: string }): Promise<void>;
  disconnectNative(): Promise<void>;

  // Phase 3: Track Recording (Radiacode Points)
  startTrackRecording(opts: Record<string, unknown>): Promise<void>;
  stopTrackRecording(): Promise<void>;

  // Phase 4: GPS Track Recording (Lines)
  startGpsTrack(opts: Record<string, unknown>): Promise<void>;
  stopGpsTrack(): Promise<void>;

  // Common Listeners
  addListener(
    event: 'disconnectRequested',
    listener: () => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    event: 'measurement',
    listener: (data: NativeMeasurementEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    event: 'notification',
    listener: (data: NativeNotificationEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    event: 'connectionState',
    listener: (data: NativeConnectionStateEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    event: 'markerWritten',
    listener: (data: MarkerWrittenEvent) => void,
  ): Promise<PluginListenerHandle>;
}

export const RadiacodeNotification =
  registerPlugin<RadiacodeNotificationPlugin>('RadiacodeNotification');
