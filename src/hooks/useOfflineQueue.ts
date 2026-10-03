'use client';

import { useEffect } from 'react';
import { startOfflineQueueWithHandlers } from '../lib/offlineQueueHandlers';

/**
 * Startet die Warteschlange für nachzuholende Server Actions und Uploads
 * (`src/lib/offlineQueue.ts`): abarbeiten beim Start und bei jedem Reconnect.
 * Hängt im `ConnectivityProvider`.
 */
export default function useOfflineQueue(): void {
  useEffect(() => startOfflineQueueWithHandlers(), []);
}
