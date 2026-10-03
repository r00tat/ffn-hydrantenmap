'use client';

import { ReactNode, useEffect } from 'react';
import useOfflineQueue from '../../hooks/useOfflineQueue';
import useOfflineSync from '../../hooks/useOfflineSync';
import { startConnectivityMonitor } from '../../lib/connectivity';

/**
 * Startet die Überwachung des Verbindungsstatus (`src/lib/connectivity.ts`)
 * für die ganze App und meldet über `useOfflineSync`, wenn offline erfasste
 * Änderungen übertragen sind. Außerdem startet er die Warteschlange für
 * nachzuholende Server Actions und Uploads (`useOfflineQueue`).
 *
 * Hängt in `AppProviders` innerhalb des `SnackbarProvider` und damit oberhalb
 * von `AuthorizationApp` — er läuft also auch auf öffentlichen Routen und vor
 * dem Login. Das ist gewollt und unbedenklich: Der Ping gegen `/api/ping`
 * braucht keine Anmeldung, und dieser Provider blendet selbst nichts ein. Die
 * Anzeige (`NetworkStatusChip`) sitzt in der `HeaderBar`.
 *
 * Den Zustand lesen Komponenten mit `useConnectivity()`; einen Context braucht
 * es dafür nicht, der Store ist modulweit.
 */
export default function ConnectivityProvider({
  children,
}: {
  children: ReactNode;
}) {
  useEffect(() => startConnectivityMonitor(), []);
  useOfflineSync();
  useOfflineQueue();
  return <>{children}</>;
}
