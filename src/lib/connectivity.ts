'use client';

import { getPendingWriteCount, subscribePendingWrites } from './pendingWrites';

/**
 * Verbindungsstatus der App.
 *
 * `navigator.onLine` allein reicht nicht: Es sagt nur, ob das Gerät *irgendeine*
 * Netzverbindung hat. In einem WLAN ohne Internet, hinter einem Captive Portal
 * oder bei einer Mobilverbindung ohne Durchsatz steht dort fälschlich „online".
 * Deshalb pingt dieser Store den eigenen Server (`/api/ping`, 204, ohne
 * Anmeldung) und gilt erst als erreichbar, wenn genau diese Antwort kommt.
 *
 * Der Store ist modulweit, damit ihn auch Code außerhalb von React lesen kann
 * (`isOffline()`, `onReconnect()` für Warteschlangen), und für
 * `useSyncExternalStore` gebaut: `getConnectivityState()` liefert dasselbe
 * Objekt, bis sich etwas ändert.
 *
 * - `offline`: `navigator.onLine === false` oder der Ping scheitert.
 * - `syncing`: erreichbar, aber es gibt noch unbestätigte Firestore-Schreibvorgänge
 *   (`pendingWrites.ts`).
 * - `online`: erreichbar und nichts offen.
 */

export type ConnectivityStatus = 'online' | 'offline' | 'syncing';

export interface ConnectivityState {
  /** Server zuletzt erreichbar (bzw. vor der ersten Prüfung: `navigator.onLine`). */
  reachable: boolean;
  status: ConnectivityStatus;
  /** Zeitpunkt (ms) der letzten abgeschlossenen Prüfung, `null` vor der ersten. */
  lastCheck: number | null;
  /** Anzahl unbestätigter Firestore-Schreibvorgänge. */
  pendingWrites: number;
}

export const PING_URL = '/api/ping';
export const PING_TIMEOUT_MS = 5_000;
export const ONLINE_INTERVAL_MS = 30_000;
export const OFFLINE_INTERVAL_MS = 10_000;

type Listener = () => void;

function navigatorOnLine(): boolean {
  return typeof navigator === 'undefined' || !('onLine' in navigator)
    ? true
    : navigator.onLine;
}

function computeStatus(reachable: boolean, pending: number): ConnectivityStatus {
  if (!reachable) return 'offline';
  return pending > 0 ? 'syncing' : 'online';
}

function buildState(
  reachable: boolean,
  lastCheck: number | null,
  pending: number,
): ConnectivityState {
  return {
    reachable,
    status: computeStatus(reachable, pending),
    lastCheck,
    pendingWrites: pending,
  };
}

let state: ConnectivityState = buildState(
  navigatorOnLine(),
  null,
  getPendingWriteCount(),
);
const listeners = new Set<Listener>();
const reconnectCallbacks = new Set<() => void>();
let inFlight: Promise<boolean> | null = null;

function update(next: Partial<Omit<ConnectivityState, 'status'>>): void {
  const reachable = next.reachable ?? state.reachable;
  const lastCheck =
    next.lastCheck !== undefined ? next.lastCheck : state.lastCheck;
  const pending = next.pendingWrites ?? state.pendingWrites;
  const wasReachable = state.reachable;

  if (
    reachable === state.reachable &&
    lastCheck === state.lastCheck &&
    pending === state.pendingWrites
  ) {
    return;
  }

  state = buildState(reachable, lastCheck, pending);
  for (const listener of listeners) {
    listener();
  }

  if (!wasReachable && reachable) {
    for (const callback of reconnectCallbacks) {
      try {
        callback();
      } catch (err) {
        console.error('onReconnect callback failed', err);
      }
    }
  }
}

// Der Zähler offener Schreibvorgänge fließt ständig mit ein, auch ohne
// laufenden Monitor — sonst stünde `syncing` erst nach dem nächsten Ping fest.
subscribePendingWrites((count) => update({ pendingWrites: count }));

export function getConnectivityState(): ConnectivityState {
  return state;
}

export function getConnectivityStatus(): ConnectivityStatus {
  return state.status;
}

export function isOffline(): boolean {
  return !state.reachable;
}

export function subscribeConnectivity(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Ruft `callback` bei jedem Wechsel von nicht erreichbar zu erreichbar auf —
 * der Haken für Warteschlangen, die nachgeholt werden sollen.
 */
export function onReconnect(callback: () => void): () => void {
  reconnectCallbacks.add(callback);
  return () => {
    reconnectCallbacks.delete(callback);
  };
}

async function ping(): Promise<boolean> {
  if (!navigatorOnLine()) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    const res = await fetch(PING_URL, {
      method: 'HEAD',
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    });
    // Nur die 204 des eigenen Endpunkts zählt. Ein Captive Portal antwortet
    // gern mit 200 und einer Login-Seite — das ist kein Server.
    return res.status === 204;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Prüft die Erreichbarkeit sofort. Gleichzeitige Aufrufe teilen sich einen
 * Ping. Liefert `true`, wenn der Server erreichbar ist.
 */
export function checkConnectivityNow(): Promise<boolean> {
  if (inFlight) return inFlight;
  inFlight = ping()
    .then((reachable) => {
      update({ reachable, lastCheck: Date.now() });
      return reachable;
    })
    .finally(() => {
      inFlight = null;
      scheduleNext();
    });
  return inFlight;
}

// --- Monitor ---------------------------------------------------------------

let monitorUsers = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

function isHidden(): boolean {
  return (
    typeof document !== 'undefined' && document.visibilityState === 'hidden'
  );
}

function scheduleNext(): void {
  if (monitorUsers === 0) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(
    () => {
      timer = null;
      // Im Hintergrund nicht pingen; beim Zurückkehren prüft
      // `visibilitychange` sofort.
      if (isHidden()) {
        scheduleNext();
        return;
      }
      void checkConnectivityNow();
    },
    state.reachable ? ONLINE_INTERVAL_MS : OFFLINE_INTERVAL_MS,
  );
}

function handleOnline(): void {
  void checkConnectivityNow();
}

function handleOffline(): void {
  // Ohne Netzlink ist der Server sicher nicht erreichbar — kein Ping nötig.
  update({ reachable: false, lastCheck: Date.now() });
  scheduleNext();
}

function handleFocus(): void {
  void checkConnectivityNow();
}

function handleVisibilityChange(): void {
  if (!isHidden()) {
    void checkConnectivityNow();
  }
}

/**
 * Startet die Überwachung: Ping sofort, danach alle 30 s (offline alle 10 s),
 * zusätzlich bei `online`/`offline`, Fokus und Rückkehr in den Vordergrund.
 *
 * Mehrfaches Starten ist erlaubt; erst der letzte zurückgegebene Stopp beendet
 * die Überwachung.
 */
export function startConnectivityMonitor(): () => void {
  monitorUsers += 1;
  if (monitorUsers === 1) {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    if (!navigatorOnLine()) {
      handleOffline();
    } else {
      void checkConnectivityNow();
    }
  }

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    monitorUsers -= 1;
    if (monitorUsers > 0) return;
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    window.removeEventListener('focus', handleFocus);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}
