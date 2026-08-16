import type { FirebaseOptions } from 'firebase/app';

/**
 * Liest die Firebase-Konfiguration, die zur Bauzeit in den Service Worker
 * eingesetzt wurde (siehe `serviceWorkerDefine`).
 *
 * Gibt `undefined` zurück, statt zu werfen. Der Worker wertet dieses Modul auf
 * oberster Ebene aus: Eine Ausnahme hier beendet die Auswertung des gesamten
 * Skripts, die Registrierung scheitert, und die App verliert nicht nur die
 * Push-Nachrichten, sondern auch Precaching und Caching-Regeln. Das Ausbleiben
 * der Hintergrund-Benachrichtigungen ist der deutlich kleinere Schaden.
 */
export function parseFirebaseConfig(raw?: string): FirebaseOptions | undefined {
  if (!raw?.trim()) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn('service worker: firebase config is not valid JSON', err);
    return undefined;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    console.warn('service worker: firebase config is not an object');
    return undefined;
  }

  // Ohne `apiKey` würde `initializeApp` werfen. Der Fall tritt ein, wenn die
  // Variable beim Bauen fehlte — dann steht hier das leere Ersatz-Objekt.
  if (!('apiKey' in parsed) || !parsed.apiKey) {
    console.warn('service worker: firebase config has no apiKey');
    return undefined;
  }

  return parsed as FirebaseOptions;
}
