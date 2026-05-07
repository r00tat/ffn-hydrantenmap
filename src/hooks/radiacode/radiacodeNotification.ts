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
  dosisleistungErrPct?: number;
  cpsErrPct?: number;
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

export interface NativeConnectionStateEvent {
  state: NativeConnectionState;
}

export interface NativeExecuteResult {
  /** Base64-encoded response body (without the 4-byte length prefix). */
  response: string;
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
  /**
   * Schickt einen kompletten geframten Request an den nativen
   * Foreground-Service und wartet auf die wieder zusammengesetzte Response
   * (base64, ohne 4-Byte-Längen-Prefix). Ersetzt das vorherige `writeNative`,
   * das Notifications einzeln durchgereicht hat.
   */
  executeNative(opts: { payload: string }): Promise<NativeExecuteResult>;
  disconnectNative(): Promise<void>;

  // Phase 3: Track Recording (Radiacode Points)
  startTrackRecording(opts: Record<string, unknown>): Promise<void>;
  stopTrackRecording(): Promise<void>;

  // Phase 4: GPS Track Recording (Lines)
  startGpsTrack(opts: Record<string, unknown>): Promise<void>;
  stopGpsTrack(): Promise<void>;

  // Phase 5: Live Location Sharing
  startLiveShare(opts: Record<string, unknown>): Promise<void>;
  stopLiveShare(): Promise<void>;
  updateLiveShareSettings(opts: Record<string, unknown>): Promise<void>;

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
