'use client';

import { useSyncExternalStore } from 'react';
import {
  getSyncErrors,
  subscribeSyncErrors,
  type SyncError,
} from '../lib/syncErrors';

const EMPTY: readonly SyncError[] = [];
const getServerSnapshot = () => EMPTY;

/** Abgelehnte Schreibvorgänge aus `src/lib/syncErrors.ts`. */
export default function useSyncErrors(): readonly SyncError[] {
  return useSyncExternalStore(
    subscribeSyncErrors,
    getSyncErrors,
    getServerSnapshot,
  );
}
