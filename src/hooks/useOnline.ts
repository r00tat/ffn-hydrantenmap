'use client';

import useConnectivity from './useConnectivity';

/**
 * `true`, solange der Server erreichbar ist.
 *
 * Dünne Hülle um `useConnectivity()`: Früher las dieser Hook nur
 * `navigator.onLine`, das in einem WLAN ohne Internet fälschlich „online"
 * meldet. Jetzt entscheidet der Ping gegen `/api/ping`
 * (siehe `src/lib/connectivity.ts`); wer mehr als ja/nein braucht — etwa
 * `syncing` oder die Zahl offener Schreibvorgänge —, nimmt `useConnectivity()`.
 */
export default function useOnline(): boolean {
  return useConnectivity().reachable;
}
