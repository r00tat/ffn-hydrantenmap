import { Capacitor, PluginListenerHandle, registerPlugin } from '@capacitor/core';
import { RadiacodeMeasurement } from './types';

export type NativeConnectionState = 'connected' | 'disconnected' | 'reconnecting';

interface NativeMeasurementEvent {
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

interface NativeNotificationEvent {
  bytes: string; // base64
}

interface NativeConnectionStateEvent {
  state: NativeConnectionState;
}

interface RadiacodeNativePlugin {
  connectNative(opts: { deviceAddress: string }): Promise<void>;
  writeNative(opts: { payload: string }): Promise<void>;
  disconnectNative(): Promise<void>;
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
}

/**
 * Das Plugin ist identisch zu `RadiacodeNotification` (Phase 1) — der native
 * Teil wurde nur um Methoden/Events erweitert. Wir registrieren es erneut
 * unter demselben Namen, um zusätzlich zur Notification-API die
 * BLE-Passthrough-Methoden typisiert zu haben.
 */
const RadiacodeNative = registerPlugin<RadiacodeNativePlugin>('RadiacodeNotification');

export type Unsubscribe = () => void;

export function isNativeAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === 'android'
  );
}

export async function nativeConnect(deviceAddress: string): Promise<void> {
  console.log('[Radiacode/nativeBridge] nativeConnect', deviceAddress);
  try {
    await RadiacodeNative.connectNative({ deviceAddress });
  } catch (err) {
    console.warn('[Radiacode/nativeBridge] nativeConnect failed', err);
    throw err;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  if (typeof btoa === 'function') return btoa(binary);
  // node fallback (jsdom-vitest hat btoa, aber safety-net)
  return Buffer.from(bytes).toString('base64');
}

function base64ToBytes(b64: string): Uint8Array {
  const bin =
    typeof atob === 'function'
      ? atob(b64)
      : Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function nativeWrite(payload: Uint8Array): Promise<void> {
  console.debug('[Radiacode/nativeBridge] nativeWrite bytes=', payload.length);
  try {
    await RadiacodeNative.writeNative({ payload: bytesToBase64(payload) });
  } catch (err) {
    console.warn('[Radiacode/nativeBridge] nativeWrite failed', err);
    throw err;
  }
}

export async function nativeDisconnect(): Promise<void> {
  console.log('[Radiacode/nativeBridge] nativeDisconnect');
  try {
    await RadiacodeNative.disconnectNative();
  } catch (err) {
    console.warn('[Radiacode/nativeBridge] nativeDisconnect failed', err);
    throw err;
  }
}

function toMeasurement(e: NativeMeasurementEvent): RadiacodeMeasurement {
  return {
    dosisleistung: e.dosisleistungUSvH,
    cps: e.cps,
    timestamp: e.timestampMs,
    dosisleistungErrPct: e.dosisleistungErrPct,
    cpsErrPct: e.cpsErrPct,
    dose: e.doseUSv,
    durationSec: e.durationSec,
    temperatureC: e.temperatureC,
    chargePct: e.chargePct,
  };
}

export function onNativeMeasurement(
  handler: (m: RadiacodeMeasurement) => void,
): Unsubscribe {
  let listenerHandle: PluginListenerHandle | null = null;
  let unsubscribed = false;
  RadiacodeNative.addListener('measurement', (data) => handler(toMeasurement(data)))
    .then((h) => {
      if (unsubscribed) {
        void h.remove();
      } else {
        listenerHandle = h;
      }
    })
    .catch(() => {
      // plugin not available — silently ignore
    });
  return () => {
    unsubscribed = true;
    listenerHandle?.remove().catch(() => {});
  };
}

export function onNativeNotification(
  handler: (bytes: Uint8Array) => void,
): Unsubscribe {
  let listenerHandle: PluginListenerHandle | null = null;
  let unsubscribed = false;
  RadiacodeNative.addListener('notification', (data) => handler(base64ToBytes(data.bytes)))
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

export function onNativeConnectionState(
  handler: (s: NativeConnectionState) => void,
): Unsubscribe {
  let listenerHandle: PluginListenerHandle | null = null;
  let unsubscribed = false;
  RadiacodeNative.addListener('connectionState', (data) => {
    console.log('[Radiacode/nativeBridge] connectionState event', data.state);
    handler(data.state);
  })
    .then((h) => {
      if (unsubscribed) {
        void h.remove();
      } else {
        listenerHandle = h;
      }
    })
    .catch((err) => {
      console.warn('[Radiacode/nativeBridge] connectionState subscribe failed', err);
    });
  return () => {
    unsubscribed = true;
    listenerHandle?.remove().catch(() => {});
  };
}
