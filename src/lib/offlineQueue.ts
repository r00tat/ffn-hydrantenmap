'use client';

import { checkConnectivityNow, isOffline, onReconnect } from './connectivity';
import { recordSyncError } from './syncErrors';
import { withTimeout } from './withTimeout';

/**
 * Warteschlange für alles, was offline nicht geht und nicht in Firestore
 * liegt: Server Actions, die nachgeholt werden sollen (etwa die Terminplanung
 * der Atemschutzwarnungen), und Uploads in den Firebase Storage.
 *
 * Firestore-Schreibvorgänge brauchen das nicht — die reiht das SDK selbst ein
 * (`persistentLocalCache`). Server Actions und Storage-Uploads dagegen
 * scheitern offline einfach.
 *
 * - **Persistent:** Die Einträge liegen in IndexedDB und überstehen ein
 *   Neuladen und einen Neustart des Geräts. Abgearbeitet wird beim Start der
 *   App (`startOfflineQueue`, erst nach einem echten Ping), bei jedem
 *   Reconnect (`onReconnect`), sobald die Anmeldung am Server bestätigt ist
 *   (`setQueueUser`), beim Zurückkehren in den Vordergrund und — nach einem
 *   Fehlschlag bei erreichbarem Server — mit wachsendem Abstand
 *   (`RETRY_BASE_MS` bis `RETRY_MAX_MS`).
 * - **Je Benutzer:** Jeder Eintrag trägt die UID dessen, der ihn eingereiht
 *   hat. Abgearbeitet und angezeigt werden nur die Einträge des aktuell
 *   angemeldeten Benutzers — auf einem geteilten Tablet laufen die Uploads
 *   von A nie mit dem Token von B. Die Einträge von A bleiben liegen, bis A
 *   sich wieder anmeldet.
 * - **Erst nach der Anmeldung:** Solange die Rechte nur aus dem
 *   Zwischenspeicher stammen oder Firebase Auth noch keinen Benutzer hat
 *   (Android-Kaltstart), wird nicht abgearbeitet — jeder Versuch scheiterte an
 *   der Anmeldung und zählte als Fehlversuch.
 * - **Vorbereitung:** Vor einem Durchlauf läuft `setQueuePreparation` (app-weit
 *   gesetzt in `offlineQueueHandlers.ts`): Firestore-Schreibvorgänge
 *   übertragen, damit eine nachgeholte Server Action den Stand sieht, den das
 *   Gerät offline geschrieben hat, und die Anmeldung am Server auffrischen.
 * - **Handler statt Funktionen:** Eine Funktion lässt sich nicht speichern.
 *   Jeder Eintrag trägt deshalb einen `type`, und der Code registriert zum Typ
 *   einen Handler (`registerQueueHandler`), der die gespeicherte `payload`
 *   ausführt. Jeder Aufruf hat eine Zeitgrenze (`ACTION_TIMEOUT_MS`,
 *   `UPLOAD_TIMEOUT_MS`), damit ein hängender Eintrag die übrigen nicht
 *   blockiert.
 * - **Idempotent:** Ein Eintrag mit demselben Schlüssel (`key`) ersetzt den
 *   vorigen. Handler müssen ein doppeltes Ausführen vertragen — ein Abbruch
 *   zwischen Ausführen und Löschen des Eintrags oder eine Zeitüberschreitung
 *   führt zu einer Wiederholung.
 * - **Fehler:** Scheitert ein Handler, weil der Server nicht erreichbar ist,
 *   bleibt der Eintrag liegen und zählt nicht als Fehlversuch; ebenso bei einem
 *   Anmeldefehler (`isQueueAuthError`). Jeder andere Fehler zählt; nach
 *   `MAX_QUEUE_ATTEMPTS` wird der Eintrag verworfen und in `syncErrors.ts`
 *   gemeldet (mit „Erneut versuchen"). Verwerfen von Hand: `removeQueued`.
 */

export type QueueEntryKind = 'action' | 'upload';

export interface QueueEntry<P = unknown> {
  id: string;
  type: string;
  kind: QueueEntryKind;
  payload: P;
  /** Anzeigename für die Fehlerliste, sonst der Typ. */
  label?: string;
  createdAt: number;
  attempts: number;
  /** UID des Benutzers, der eingereiht hat. Nur er arbeitet den Eintrag ab. */
  uid?: string;
}

export interface QueueStorage {
  getAll(): Promise<QueueEntry[]>;
  put(entry: QueueEntry): Promise<void>;
  delete(id: string): Promise<void>;
}

export type QueueHandler<P = unknown> = (payload: P) => Promise<unknown>;

/**
 * Läuft vor einem Durchlauf. `false` heißt: jetzt nicht abarbeiten (etwa weil
 * die Anmeldung am Server nicht aufzufrischen war) und später erneut.
 */
export type QueuePreparation = () => Promise<boolean>;

export interface EnqueueOptions {
  /** Schlüssel für die Idempotenz: ersetzt einen Eintrag gleichen Schlüssels. */
  key?: string;
  label?: string;
  kind?: QueueEntryKind;
}

export const MAX_QUEUE_ATTEMPTS = 5;
/** Zeitgrenze je Server Action. */
export const ACTION_TIMEOUT_MS = 60_000;
/** Zeitgrenze je Upload — großzügig, ein Foto über eine schwache Verbindung dauert. */
export const UPLOAD_TIMEOUT_MS = 10 * 60_000;
/** Erste Wiederholung nach einem Fehlschlag bei erreichbarem Server. */
export const RETRY_BASE_MS = 30_000;
/** Längster Abstand zwischen zwei Wiederholungen. */
export const RETRY_MAX_MS = 5 * 60_000;

// --- Speicher ----------------------------------------------------------------

export function createMemoryStorage(): QueueStorage {
  const entries = new Map<string, QueueEntry>();
  return {
    async getAll() {
      return [...entries.values()];
    },
    async put(entry) {
      entries.set(entry.id, entry);
    },
    async delete(id) {
      entries.delete(id);
    },
  };
}

const IDB_NAME = 'ffnd-offline-queue';
const IDB_STORE = 'entries';

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * IndexedDB über die native API — für drei Operationen lohnt keine
 * Bibliothek. Blobs (die Dateien der Upload-Warteschlange) speichert
 * IndexedDB direkt.
 */
export function createIndexedDbStorage(name = IDB_NAME): QueueStorage {
  let dbPromise: Promise<IDBDatabase> | null = null;
  const open = () => {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore(IDB_STORE, { keyPath: 'id' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return dbPromise;
  };
  const store = async (mode: IDBTransactionMode) =>
    (await open()).transaction(IDB_STORE, mode).objectStore(IDB_STORE);

  return {
    async getAll() {
      return requestToPromise(
        (await store('readonly')).getAll() as IDBRequest<QueueEntry[]>,
      );
    },
    async put(entry) {
      await requestToPromise((await store('readwrite')).put(entry));
    },
    async delete(id) {
      await requestToPromise((await store('readwrite')).delete(id));
    },
  };
}

function defaultStorage(): QueueStorage {
  return typeof indexedDB !== 'undefined'
    ? createIndexedDbStorage()
    : createMemoryStorage();
}

// --- Fehlerarten ---------------------------------------------------------------

const AUTH_ERROR_CODES = new Set([
  'storage/unauthenticated',
  'storage/unauthorized',
  'unauthenticated',
]);

/**
 * Scheitert ein Eintrag an der Anmeldung? Dann zählt er nicht als
 * Fehlversuch: Nach einem Kaltstart oder einer langen Funkstille ist das
 * Token oft nur noch nicht erneuert, und ein späterer Durchlauf gelingt.
 */
export function isQueueAuthError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && AUTH_ERROR_CODES.has(code);
}

// --- Zustand -----------------------------------------------------------------

type Listener = () => void;

interface QueueUser {
  uid: string | null;
  /** Anmeldung am Server bestätigt — erst dann wird abgearbeitet. */
  ready: boolean;
}

let storage: QueueStorage | null = null;
let ready: Promise<void> | null = null;
let allEntries: QueueEntry[] = [];
let snapshot: readonly QueueEntry[] = [];
const handlers = new Map<string, QueueHandler>();
const listeners = new Set<Listener>();
let processing: Promise<void> | null = null;
let rerunRequested = false;
let counter = 0;
let user: QueueUser = { uid: null, ready: false };
let preparation: QueuePreparation | null = null;
let started = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryRound = 0;

function notify(): void {
  for (const listener of listeners) listener();
}

function sortEntries(entries: QueueEntry[]): QueueEntry[] {
  return [...entries].sort((a, b) => a.createdAt - b.createdAt);
}

function belongsToCurrentUser(entry: QueueEntry): boolean {
  return user.uid !== null && entry.uid === user.uid;
}

function setSnapshot(entries: QueueEntry[]): void {
  allEntries = sortEntries(entries);
  snapshot = allEntries.filter(belongsToCurrentUser);
  notify();
}

function getStorage(): QueueStorage {
  if (!storage) setQueueStorage(defaultStorage());
  return storage!;
}

async function ensureReady(): Promise<QueueStorage> {
  const s = getStorage();
  await ready;
  return s;
}

async function refresh(s: QueueStorage): Promise<void> {
  setSnapshot(await s.getAll());
}

/** Ersetzt den Speicher (Tests, oder ein Rückfall ohne IndexedDB). */
export function setQueueStorage(next: QueueStorage): void {
  storage = next;
  ready = refresh(next).catch((err) => {
    console.error('offline queue: loading failed', err);
  });
}

/**
 * Wer ist angemeldet, und ist die Anmeldung am Server bestätigt? Gesetzt von
 * `useOfflineQueue` aus dem Anmeldezustand. Wird die Anmeldung bestätigt,
 * arbeitet die laufende Warteschlange sofort ab.
 */
export function setQueueUser(uid: string | null, serverVerified: boolean): void {
  const next: QueueUser = { uid, ready: uid !== null && serverVerified };
  if (next.uid === user.uid && next.ready === user.ready) return;
  const becameReady = next.ready && (!user.ready || next.uid !== user.uid);
  user = next;
  setSnapshot(allEntries);
  if (becameReady && started > 0) void processQueue();
}

/** Setzt die Vorbereitung vor jedem Durchlauf (siehe Modulkommentar). */
export function setQueuePreparation(next: QueuePreparation | null): void {
  preparation = next;
}

export function registerQueueHandler<P>(
  type: string,
  handler: QueueHandler<P>,
): () => void {
  handlers.set(type, handler as QueueHandler);
  return () => {
    if (handlers.get(type) === handler) handlers.delete(type);
  };
}

/** Alle Einträge, unabhängig vom Benutzer — für Tests und die Fehlersuche. */
export async function getQueuedEntries(): Promise<QueueEntry[]> {
  const s = await ensureReady();
  return sortEntries(await s.getAll());
}

/**
 * Für `useSyncExternalStore`: die Einträge des angemeldeten Benutzers, dasselbe
 * Array, bis sich etwas ändert.
 */
export function getQueueSnapshot(): readonly QueueEntry[] {
  getStorage();
  return snapshot;
}

export function subscribeQueue(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function enqueue<P>(
  type: string,
  payload: P,
  options: EnqueueOptions = {},
): Promise<QueueEntry<P>> {
  const s = await ensureReady();
  counter += 1;
  const entry: QueueEntry<P> = {
    id: options.key ?? `${type}-${Date.now().toString(36)}-${counter}`,
    type,
    kind: options.kind ?? 'action',
    payload,
    label: options.label,
    createdAt: Date.now() + counter / 1000,
    attempts: 0,
    ...(user.uid ? { uid: user.uid } : {}),
  };
  await s.put(entry as QueueEntry);
  await refresh(s);
  return entry;
}

/** Verwirft einen Eintrag (etwa einen wartenden Upload in der Oberfläche). */
export async function removeQueued(id: string): Promise<void> {
  const s = await ensureReady();
  await s.delete(id);
  await refresh(s);
}

/** Ist der Server nach einem Fehler erreichbar? Offline zählt kein Versuch. */
async function serverReachable(): Promise<boolean> {
  if (isOffline()) return false;
  try {
    return await checkConnectivityNow();
  } catch {
    return false;
  }
}

function timeoutFor(kind: QueueEntryKind): number {
  return kind === 'upload' ? UPLOAD_TIMEOUT_MS : ACTION_TIMEOUT_MS;
}

/**
 * Führt sofort aus, wenn der Server erreichbar ist; sonst — oder wenn der
 * Aufruf am fehlenden Netz scheitert — wird eingereiht. Ein Fehler bei
 * erreichbarem Server kommt beim Aufrufer an.
 */
export async function runOrQueue<P>(
  type: string,
  payload: P,
  options: EnqueueOptions = {},
): Promise<'done' | 'queued'> {
  const handler = handlers.get(type);
  if (!handler) {
    throw new Error(`offline queue: no handler registered for ${type}`);
  }
  if (isOffline()) {
    await enqueue(type, payload, options);
    return 'queued';
  }
  try {
    await withTimeout(
      handler(payload),
      timeoutFor(options.kind ?? 'action'),
      type,
    );
    return 'done';
  } catch (err) {
    if (await serverReachable()) throw err;
    await enqueue(type, payload, options);
    return 'queued';
  }
}

type PassResult = 'done' | 'offline' | 'retry' | 'notReady';

async function processOnce(): Promise<PassResult> {
  const s = await ensureReady();
  if (!user.ready) return 'notReady';
  const own = sortEntries(await s.getAll()).filter(belongsToCurrentUser);
  if (own.length === 0) return 'done';
  if (isOffline()) return 'offline';

  if (preparation) {
    const prepared = await preparation().catch((err) => {
      console.warn('offline queue: preparation failed', err);
      return false;
    });
    if (!prepared) return (await serverReachable()) ? 'retry' : 'offline';
  }

  let result: PassResult = 'done';
  for (const entry of own) {
    if (isOffline()) {
      result = 'offline';
      break;
    }
    // Der Benutzer hat gewechselt, während der Durchlauf lief.
    if (!user.ready || !belongsToCurrentUser(entry)) {
      result = 'notReady';
      break;
    }
    const handler = handlers.get(entry.type);
    if (!handler) continue;
    try {
      await withTimeout(
        handler(entry.payload),
        timeoutFor(entry.kind),
        entry.type,
      );
      await s.delete(entry.id);
    } catch (error) {
      console.error(`offline queue: ${entry.type} failed`, error);
      if (!(await serverReachable())) {
        result = 'offline';
        break;
      }
      if (isQueueAuthError(error)) {
        // Die übrigen Einträge scheiterten genauso; später erneut.
        result = 'retry';
        break;
      }
      result = 'retry';
      const attempts = entry.attempts + 1;
      if (attempts >= MAX_QUEUE_ATTEMPTS) {
        await s.delete(entry.id);
        recordSyncError({
          kind: entry.kind,
          path: entry.label ?? entry.type,
          error,
          retry: () => {
            void enqueue(entry.type, entry.payload, {
              key: entry.id,
              label: entry.label,
              kind: entry.kind,
            }).then(() => processQueue());
          },
        });
      } else {
        await s.put({ ...entry, attempts });
      }
    }
  }
  await refresh(s);
  return result;
}

function clearRetry(): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function scheduleRetry(): void {
  clearRetry();
  if (started === 0) return;
  const delay = Math.min(RETRY_BASE_MS * 2 ** retryRound, RETRY_MAX_MS);
  retryRound += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void processQueue();
  }, delay);
}

/**
 * Arbeitet die Warteschlange ab. Kommt ein Aufruf, während ein Durchlauf
 * läuft, folgt danach ein weiterer — ein Reconnect mitten im Durchlauf geht
 * so nicht verloren.
 */
export function processQueue(): Promise<void> {
  if (processing) {
    rerunRequested = true;
    return processing;
  }
  processing = (async () => {
    try {
      let result: PassResult;
      do {
        rerunRequested = false;
        result = await processOnce();
      } while (rerunRequested && result !== 'offline');
      if (result === 'retry') {
        scheduleRetry();
      } else {
        clearRetry();
        if (result === 'done') retryRound = 0;
      }
    } catch (err) {
      console.error('offline queue: processing failed', err);
    } finally {
      processing = null;
    }
  })();
  return processing;
}

function handleVisibilityChange(): void {
  if (document.visibilityState === 'visible' && snapshot.length > 0) {
    void processQueue();
  }
}

/**
 * Hängt die Warteschlange an den Verbindungsstatus: abarbeiten beim Start
 * (Einträge eines früheren Laufs, aber erst nach einem echten Ping — vor dem
 * ersten gilt nur `navigator.onLine`), bei jedem Reconnect und beim
 * Zurückkehren in den Vordergrund.
 */
export function startOfflineQueue(): () => void {
  started += 1;
  const unsubscribe = onReconnect(() => {
    void processQueue();
  });
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }
  void checkConnectivityNow()
    .catch(() => false)
    .then((reachable) => {
      if (reachable && started > 0) void processQueue();
    });
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    started -= 1;
    unsubscribe();
    if (started === 0) {
      clearRetry();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    }
  };
}

/** Nur für Tests. */
export function resetOfflineQueueForTests(): void {
  clearRetry();
  storage = null;
  ready = null;
  allEntries = [];
  snapshot = [];
  handlers.clear();
  listeners.clear();
  processing = null;
  rerunRequested = false;
  user = { uid: null, ready: false };
  preparation = null;
  started = 0;
  retryRound = 0;
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  }
}
