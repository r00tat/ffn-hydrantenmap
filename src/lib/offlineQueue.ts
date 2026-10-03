'use client';

import { checkConnectivityNow, isOffline, onReconnect } from './connectivity';
import { recordSyncError } from './syncErrors';

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
 *   Neuladen und einen Neustart des Geräts. Beim Start der App
 *   (`startOfflineQueue`) und bei jedem Reconnect (`onReconnect`) wird
 *   abgearbeitet.
 * - **Handler statt Funktionen:** Eine Funktion lässt sich nicht speichern.
 *   Jeder Eintrag trägt deshalb einen `type`, und der Code registriert zum Typ
 *   einen Handler (`registerQueueHandler`), der die gespeicherte `payload`
 *   ausführt. Die Handler registriert `offlineQueueHandlers.ts` app-weit, damit
 *   die Warteschlange auch abgearbeitet wird, wenn die Seite, die eingereiht
 *   hat, nicht mehr offen ist.
 * - **Idempotent:** Ein Eintrag mit demselben Schlüssel (`key`) ersetzt den
 *   vorigen. Handler müssen ein doppeltes Ausführen vertragen — ein Abbruch
 *   zwischen Ausführen und Löschen des Eintrags führt zu einer Wiederholung.
 * - **Fehler:** Scheitert ein Handler, weil der Server nicht erreichbar ist,
 *   bleibt der Eintrag liegen und zählt nicht als Fehlversuch. Jeder andere
 *   Fehler zählt; nach `MAX_QUEUE_ATTEMPTS` wird der Eintrag verworfen und in
 *   `syncErrors.ts` gemeldet (mit „Erneut versuchen").
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
}

export interface QueueStorage {
  getAll(): Promise<QueueEntry[]>;
  put(entry: QueueEntry): Promise<void>;
  delete(id: string): Promise<void>;
}

export type QueueHandler<P = unknown> = (payload: P) => Promise<unknown>;

export interface EnqueueOptions {
  /** Schlüssel für die Idempotenz: ersetzt einen Eintrag gleichen Schlüssels. */
  key?: string;
  label?: string;
  kind?: QueueEntryKind;
}

export const MAX_QUEUE_ATTEMPTS = 5;

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

// --- Zustand -----------------------------------------------------------------

type Listener = () => void;

let storage: QueueStorage | null = null;
let ready: Promise<void> | null = null;
let snapshot: readonly QueueEntry[] = [];
const handlers = new Map<string, QueueHandler>();
const listeners = new Set<Listener>();
let processing: Promise<void> | null = null;
let counter = 0;

function notify(): void {
  for (const listener of listeners) listener();
}

function sortEntries(entries: QueueEntry[]): QueueEntry[] {
  return [...entries].sort((a, b) => a.createdAt - b.createdAt);
}

function setSnapshot(entries: QueueEntry[]): void {
  snapshot = sortEntries(entries);
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

export function registerQueueHandler<P>(
  type: string,
  handler: QueueHandler<P>,
): () => void {
  handlers.set(type, handler as QueueHandler);
  return () => {
    if (handlers.get(type) === handler) handlers.delete(type);
  };
}

export async function getQueuedEntries(): Promise<QueueEntry[]> {
  const s = await ensureReady();
  return sortEntries(await s.getAll());
}

/** Für `useSyncExternalStore`: dasselbe Array, bis sich etwas ändert. */
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
  };
  await s.put(entry as QueueEntry);
  await refresh(s);
  return entry;
}

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
    await handler(payload);
    return 'done';
  } catch (err) {
    if (await serverReachable()) throw err;
    await enqueue(type, payload, options);
    return 'queued';
  }
}

async function processOnce(): Promise<void> {
  const s = await ensureReady();
  const entries = sortEntries(await s.getAll());
  for (const entry of entries) {
    if (isOffline()) break;
    const handler = handlers.get(entry.type);
    if (!handler) continue;
    try {
      await handler(entry.payload);
      await s.delete(entry.id);
    } catch (error) {
      if (!(await serverReachable())) break;
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
      console.error(`offline queue: ${entry.type} failed`, error);
    }
  }
  await refresh(s);
}

/**
 * Arbeitet die Warteschlange ab. Gleichzeitige Aufrufe teilen sich einen
 * Durchlauf.
 */
export function processQueue(): Promise<void> {
  if (!processing) {
    processing = processOnce()
      .catch((err) => {
        console.error('offline queue: processing failed', err);
      })
      .finally(() => {
        processing = null;
      });
  }
  return processing;
}

/**
 * Hängt die Warteschlange an den Verbindungsstatus: abarbeiten beim Start
 * (Einträge eines früheren Laufs) und bei jedem Reconnect.
 */
export function startOfflineQueue(): () => void {
  const unsubscribe = onReconnect(() => {
    void processQueue();
  });
  if (!isOffline()) void processQueue();
  return unsubscribe;
}

/** Nur für Tests. */
export function resetOfflineQueueForTests(): void {
  storage = null;
  ready = null;
  snapshot = [];
  handlers.clear();
  listeners.clear();
  processing = null;
}
