'use client';

/**
 * Speicher für Schreibvorgänge, die der Server beim Synchronisieren abgelehnt
 * hat.
 *
 * Mit dem persistenten Firestore-Cache landet ein Schreibvorgang sofort lokal,
 * die Firestore-Regeln prüft aber erst der Server — offline also erst beim
 * Reconnect. Lehnt er ab, nimmt das SDK die Änderung still aus dem Cache. Die
 * lokalen Schreibhelfer in `firestoreClient.ts` (`addDocLocal` & Co.) tragen
 * jede solche Ablehnung hier ein, damit die Oberfläche sie zeigen kann
 * (Status-Chip in der Kopfzeile).
 *
 * Der Speicher lebt nur im Arbeitsspeicher: Die Wiederholung ist eine Closure
 * über den ursprünglichen Schreibvorgang, und die überlebt kein Neuladen.
 * Für `useSyncExternalStore` gebaut: `getSyncErrors()` liefert dasselbe Array,
 * bis sich etwas ändert.
 */

export type SyncWriteKind =
  | 'add'
  | 'set'
  | 'update'
  | 'delete'
  | 'batch'
  // Aus der Warteschlange `offlineQueue.ts`: nachgeholte Server Action bzw. Upload.
  | 'action'
  | 'upload';

export interface SyncError {
  id: string;
  kind: SyncWriteKind;
  /** Dokumentpfad bzw. bei einem Batch eine Beschreibung. */
  path: string;
  /** Zeitpunkt der Ablehnung (ms). */
  timestamp: number;
  /** Firestore-Fehlercode, z. B. `permission-denied`; sonst `unknown`. */
  code: string;
  message: string;
  canRetry: boolean;
}

export interface SyncErrorInput {
  kind: SyncWriteKind;
  path: string;
  error: unknown;
  /** Setzt denselben Schreibvorgang erneut ab. */
  retry?: () => void;
}

/** Obergrenze, damit eine Flut von Ablehnungen nicht unbegrenzt wächst. */
export const MAX_SYNC_ERRORS = 100;

type Listener = () => void;

let errors: readonly SyncError[] = [];
const retries = new Map<string, () => void>();
const listeners = new Set<Listener>();
let counter = 0;

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code ? code : 'unknown';
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' ? message : String(error);
}

export function recordSyncError(input: SyncErrorInput): SyncError {
  counter += 1;
  const entry: SyncError = {
    id: `${Date.now().toString(36)}-${counter}`,
    kind: input.kind,
    path: input.path,
    timestamp: Date.now(),
    code: errorCode(input.error),
    message: errorMessage(input.error),
    canRetry: typeof input.retry === 'function',
  };
  if (input.retry) retries.set(entry.id, input.retry);

  let next = [...errors, entry];
  if (next.length > MAX_SYNC_ERRORS) {
    const dropped = next.slice(0, next.length - MAX_SYNC_ERRORS);
    for (const old of dropped) retries.delete(old.id);
    next = next.slice(-MAX_SYNC_ERRORS);
  }
  errors = next;
  console.error(
    `Synchronisation abgelehnt (${entry.kind} ${entry.path}): ${entry.code}`,
    input.error,
  );
  notify();
  return entry;
}

export function getSyncErrors(): readonly SyncError[] {
  return errors;
}

export function subscribeSyncErrors(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function dismissSyncError(id: string): void {
  if (!errors.some((e) => e.id === id)) return;
  errors = errors.filter((e) => e.id !== id);
  retries.delete(id);
  notify();
}

/**
 * Setzt den Schreibvorgang erneut ab und nimmt den Eintrag aus der Liste.
 * Scheitert er wieder, trägt ihn der Schreibhelfer neu ein.
 */
export function retrySyncError(id: string): void {
  const retry = retries.get(id);
  if (!retry) return;
  dismissSyncError(id);
  try {
    retry();
  } catch (err) {
    console.error('Erneuter Schreibversuch fehlgeschlagen', err);
  }
}

export function clearSyncErrors(): void {
  if (errors.length === 0) return;
  errors = [];
  retries.clear();
  notify();
}
