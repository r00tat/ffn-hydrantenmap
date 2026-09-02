'use client';

import { deviceLabelFromUserAgent } from './liveLocation';

export const DEVICE_STORAGE_KEY = 'liveLocationDevice/v1';

/**
 * Die Geräte-ID ist der Schlüssel des eigenen Live-Standort-Dokuments
 * (`livelocation/<uid>_<deviceId>`). Sie muss deshalb über Reloads hinweg
 * stabil bleiben: wechselt sie, hinterlässt jedes Teilen ein zweites Dokument,
 * das erst die Firestore-TTL nach einer Stunde wegräumt — bis dahin steht der
 * eigene Pin doppelt auf den Karten der anderen.
 *
 * Zeichenvorrat und Länge sind bewusst eng: die Firestore-Regeln prüfen die
 * Dokument-ID gegen `<uid>_[A-Za-z0-9]+`, alles andere lehnt der Server ab.
 */
const DEVICE_ID_PATTERN = /^[a-z0-9]{12}$/;

function randomDeviceId(): string {
  const bytes = new Uint8Array(6);
  const cryptoObj =
    typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Stabile ID dieses Geräts/Browsers. Ohne `localStorage` (SSR, gesperrter
 * Speicher) bleibt sie leer — dann fällt `liveLocationDocId` auf die bloße uid
 * zurück und es gilt wieder ein Dokument je Benutzer.
 */
export function liveLocationDeviceId(): string {
  if (typeof window === 'undefined') return '';
  try {
    const stored = window.localStorage.getItem(DEVICE_STORAGE_KEY);
    if (stored && DEVICE_ID_PATTERN.test(stored)) return stored;
    const fresh = randomDeviceId();
    window.localStorage.setItem(DEVICE_STORAGE_KEY, fresh);
    return fresh;
  } catch {
    return '';
  }
}

/** Grobe Geräteart dieses Browsers, siehe `deviceLabelFromUserAgent`. */
export function liveLocationDeviceLabel(): string {
  if (typeof navigator === 'undefined') return '';
  return deviceLabelFromUserAgent(navigator.userAgent || '');
}
