'use client';

import { useSyncExternalStore } from 'react';
import {
  ConnectivityState,
  getConnectivityState,
  subscribeConnectivity,
} from '../lib/connectivity';

// Der Server kennt keinen Verbindungsstatus; „online" passt zum ersten Render
// im Browser und vermeidet einen Hydration-Unterschied.
const SERVER_SNAPSHOT: ConnectivityState = {
  reachable: true,
  status: 'online',
  lastCheck: null,
  pendingWrites: 0,
};

const getServerSnapshot = () => SERVER_SNAPSHOT;

/**
 * Verbindungsstatus aus `src/lib/connectivity.ts`. Die Überwachung (Ping,
 * Events) startet der `ConnectivityProvider`; dieser Hook liest nur.
 */
export default function useConnectivity(): ConnectivityState {
  return useSyncExternalStore(
    subscribeConnectivity,
    getConnectivityState,
    getServerSnapshot,
  );
}
