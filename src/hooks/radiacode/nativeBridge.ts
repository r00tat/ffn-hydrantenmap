import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { RadiacodeMeasurement } from './types';
import {
  NativeConnectionState,
  NativeConnectionStateEvent,
  NativeMeasurementEvent,
  RadiacodeNotification,
} from './radiacodeNotification';

export type { NativeConnectionState };

/**
 * Das Plugin ist identisch zu `RadiacodeNotification` (Phase 1) — der native
 * Teil wurde nur um Methoden/Events erweitert. Wir nutzen das zentral registrierte
 * Plugin aus radiacodeNotification.ts.
 */
const RadiacodeNative = RadiacodeNotification;

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

/**
 * One-shot Wire-Level-Execute: schickt einen kompletten geframten Request an
 * den nativen Foreground-Service und wartet auf die wieder zusammengesetzte
 * Response (ohne 4-Byte-Längen-Prefix). Ersetzt den vorherigen
 * `nativeWrite`-Pfad, der rohe Notifications einzeln an die JS-Seite
 * weitergereicht hat — der native Stack assembliert jetzt die Frames
 * vollständig, bevor JS sie sieht.
 */
export async function nativeExecute(payload: Uint8Array): Promise<Uint8Array> {
  console.debug('[Radiacode/nativeBridge] nativeExecute bytes=', payload.length);
  try {
    const result = await RadiacodeNative.executeNative({
      payload: bytesToBase64(payload),
    });
    return base64ToBytes(result.response);
  } catch (err) {
    console.warn('[Radiacode/nativeBridge] nativeExecute failed', err);
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
  // Rare-Record-Felder (dose, durationSec, temperatureC, chargePct) liefert
  // der Foreground-Service nur alle paar Sekunden — ein Tick ohne Rare-Record
  // kommt ohne diese Keys im Event an. Wir dürfen sie deshalb NICHT als
  // `undefined` ins Ergebnis schreiben, sonst überschreibt der Spread in
  // `useRadiacodeDevice` (`setMeasurement((prev) => ({...prev, ...m}))`) die
  // zuletzt gesehenen Werte und die UI zeigt dauerhaft „—" für Gesamtdosis,
  // Temperatur, Akku und Messdauer.
  return {
    dosisleistung: e.dosisleistungUSvH,
    cps: e.cps,
    timestamp: e.timestampMs,
    ...(e.dosisleistungErrPct != null && {
      dosisleistungErrPct: e.dosisleistungErrPct,
    }),
    ...(e.cpsErrPct != null && { cpsErrPct: e.cpsErrPct }),
    ...(e.doseUSv != null && { dose: e.doseUSv }),
    ...(e.durationSec != null && { durationSec: e.durationSec }),
    ...(e.temperatureC != null && { temperatureC: e.temperatureC }),
    ...(e.chargePct != null && { chargePct: e.chargePct }),
  };
}

/** Testhook — exponiert den ansonsten modulprivaten Mapper. */
export const toMeasurementForTest = toMeasurement;

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
