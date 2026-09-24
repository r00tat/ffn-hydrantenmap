/**
 * Gedächtnis des Sprach-Assistenten über das Ende eines Gesprächs hinaus.
 *
 * Zwei Dinge liegen hier je Einsatz: ausdrücklich angesagte Notizen („merk dir:
 * weitere Messwerte gehören zu Trupp 1") und ein Protokoll des vorigen
 * Gesprächs, damit „wie vorhin" im nächsten noch trägt. Beides geht über den
 * Kartenkontext ans Modell; ausgelegt wird es dort, nicht hier.
 *
 * Gespeichert wird im `localStorage` und damit je Gerät — gewollt, denn zwei
 * Tablets am selben Account sollen sich ihre Vorgaben nicht gegenseitig
 * unterschieben. Jeder Zugriff ist abgefangen: Ohne Speicher gibt es kein
 * Gedächtnis, das Gespräch läuft trotzdem.
 *
 * Hintergrund: [docs/ai-sprachassistent.md](../../../docs/ai-sprachassistent.md)
 */

export interface AssistantNote {
  id: string;
  text: string;
  createdAt: string;
}

export interface ConversationExchange {
  /** Was der Benutzer gesagt hat, soweit bekannt. */
  heard: string;
  /** Die Antwort des Assistenten. */
  answer: string;
  /** Aufgerufene Werkzeuge, nur mit Namen (siehe `describeToolCall`). */
  tools?: string[];
}

export interface AssistantMemory {
  version: 1;
  updatedAt: string;
  notes: AssistantNote[];
  lastConversation?: {
    endedAt: string;
    exchanges: ConversationExchange[];
  };
}

export type MemoryCommand =
  | { action: 'add'; text?: string }
  | { action: 'remove'; noteId?: string; text?: string }
  | { action: 'clear' };

export interface MemoryCommandResult {
  success: boolean;
  message: string;
  notes: { id: string; text: string }[];
}

/** Mehr als eine Handvoll Vorgaben hält niemand im Kopf — das Modell auch nicht. */
export const MAX_NOTES = 25;
/** So viele Wechsel des vorigen Gesprächs gehen in den Kontext. */
export const MAX_EXCHANGES = 10;
const MAX_HEARD = 200;
const MAX_ANSWER = 300;
/** Einsätze, die so lange ruhen, werden beim Laden weggeräumt. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const KEY_PREFIX = 'ffn.aiMemory.';

export function memoryKey(firecallId: string): string {
  return `${KEY_PREFIX}${firecallId}`;
}

function emptyMemory(now: Date): AssistantMemory {
  return { version: 1, updatedAt: now.toISOString(), notes: [] };
}

function defaultStorage(): Storage | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    // Gesperrte Website-Daten werfen schon beim Zugriff auf die Eigenschaft.
    return undefined;
  }
}

const listeners = new Set<(firecallId: string) => void>();

/**
 * Änderungen abonnieren. Einzelaufruf und Live-Sitzung haben je einen eigenen
 * Werkzeug-Runner; ohne Abonnement sähe der eine die Notizen des anderen erst
 * nach dem Neuladen.
 */
export function subscribeMemory(listener: (firecallId: string) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let version = 0;

/** Zählt jede Änderung — ein stabiler Schnappschuss für `useSyncExternalStore`. */
export function memoryVersion(): number {
  return version;
}

function notify(firecallId: string): void {
  version++;
  for (const listener of listeners) listener(firecallId);
}

function parse(raw: string | null): AssistantMemory | undefined {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !Array.isArray(value.notes)) return undefined;
    return value as AssistantMemory;
  } catch {
    return undefined;
  }
}

/** Ruhende Einsätze wegräumen, damit der Speicher nicht über Monate wächst. */
function prune(storage: Storage, keep: string, now: Date): void {
  const stale: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(KEY_PREFIX) || key === memoryKey(keep)) continue;
    const memory = parse(storage.getItem(key));
    const updated = memory ? Date.parse(memory.updatedAt) : NaN;
    if (!memory || !(now.getTime() - updated <= MAX_AGE_MS)) stale.push(key);
  }
  for (const key of stale) storage.removeItem(key);
}

export function loadMemory(
  firecallId: string,
  storage: Storage | undefined = defaultStorage(),
  now = new Date(),
): AssistantMemory {
  if (!storage) return emptyMemory(now);
  try {
    prune(storage, firecallId, now);
    return parse(storage.getItem(memoryKey(firecallId))) ?? emptyMemory(now);
  } catch {
    return emptyMemory(now);
  }
}

function store(
  firecallId: string,
  memory: AssistantMemory,
  storage: Storage | undefined,
  now: Date,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(
      memoryKey(firecallId),
      JSON.stringify({ ...memory, updatedAt: now.toISOString() }),
    );
  } catch {
    return false;
  }
  notify(firecallId);
  return true;
}

function normalize(text: string): string {
  return text.toLocaleLowerCase('de').replace(/\s+/g, ' ').trim();
}

function newId(notes: AssistantNote[]): string {
  const used = new Set(notes.map((n) => n.id));
  for (let i = notes.length + 1; ; i++) {
    if (!used.has(`n${i}`)) return `n${i}`;
  }
}

export type AddNoteResult =
  | { ok: true; note: AssistantNote; memory: AssistantMemory }
  | { ok: false; reason: 'empty' | 'full' | 'unavailable'; memory: AssistantMemory };

export function addNote(
  firecallId: string,
  text: string,
  storage: Storage | undefined = defaultStorage(),
  now = new Date(),
): AddNoteResult {
  const memory = loadMemory(firecallId, storage, now);
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return { ok: false, reason: 'empty', memory };

  const same = memory.notes.find((n) => normalize(n.text) === normalize(clean));
  if (same) return { ok: true, note: same, memory };
  // Abgelehnt statt verdrängt: Eine still vergessene Vorgabe ist schlimmer
  // als eine Rückfrage.
  if (memory.notes.length >= MAX_NOTES) return { ok: false, reason: 'full', memory };

  const note = { id: newId(memory.notes), text: clean, createdAt: now.toISOString() };
  const next = { ...memory, notes: [...memory.notes, note] };
  if (!store(firecallId, next, storage, now)) return { ok: false, reason: 'unavailable', memory };
  return { ok: true, note, memory: next };
}

export type RemoveNoteResult =
  | { ok: true; removed: AssistantNote; memory: AssistantMemory }
  | {
      ok: false;
      reason: 'notFound' | 'ambiguous' | 'unavailable';
      matches?: AssistantNote[];
      memory: AssistantMemory;
    };

export function removeNote(
  firecallId: string,
  target: { noteId?: string; text?: string },
  storage: Storage | undefined = defaultStorage(),
  now = new Date(),
): RemoveNoteResult {
  const memory = loadMemory(firecallId, storage, now);
  let matches: AssistantNote[] = [];
  if (target.noteId) {
    matches = memory.notes.filter((n) => n.id === target.noteId);
  } else if (target.text?.trim()) {
    const query = normalize(target.text);
    const exact = memory.notes.filter((n) => normalize(n.text) === query);
    matches =
      exact.length > 0
        ? exact
        : memory.notes.filter((n) => {
            const text = normalize(n.text);
            return text.includes(query) || query.includes(text);
          });
  }

  if (matches.length === 0) return { ok: false, reason: 'notFound', memory };
  if (matches.length > 1) return { ok: false, reason: 'ambiguous', matches, memory };

  const [removed] = matches;
  const next = { ...memory, notes: memory.notes.filter((n) => n.id !== removed.id) };
  if (!store(firecallId, next, storage, now)) return { ok: false, reason: 'unavailable', memory };
  return { ok: true, removed, memory: next };
}

export function clearNotes(
  firecallId: string,
  storage: Storage | undefined = defaultStorage(),
  now = new Date(),
): boolean {
  const memory = loadMemory(firecallId, storage, now);
  return store(firecallId, { ...memory, notes: [] }, storage, now);
}

function shorten(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

/**
 * Das Protokoll eines beendeten Gesprächs ablegen. Es ersetzt das vorige;
 * ein Gespräch ohne Wechsel lässt das vorige stehen.
 */
export function saveConversation(
  firecallId: string,
  exchanges: ConversationExchange[],
  storage: Storage | undefined = defaultStorage(),
  now = new Date(),
): void {
  if (exchanges.length === 0) return;
  const memory = loadMemory(firecallId, storage, now);
  store(
    firecallId,
    {
      ...memory,
      lastConversation: {
        endedAt: now.toISOString(),
        exchanges: exchanges.slice(-MAX_EXCHANGES).map((exchange) => ({
          heard: shorten(exchange.heard, MAX_HEARD),
          answer: shorten(exchange.answer, MAX_ANSWER),
          ...(exchange.tools?.length ? { tools: exchange.tools } : {}),
        })),
      },
    },
    storage,
    now,
  );
}

/**
 * Ein Werkzeugaufruf fürs Protokoll: Name und gegebenenfalls der Name des
 * Elements. Die übrigen Argumente bleiben draußen — Koordinaten und Messwerte
 * stehen im Einsatz, und im Protokoll verleiteten sie nur zum Wiederholen.
 */
export function describeToolCall(call: { name: string; args?: object }): string {
  const name = (call.args as Record<string, unknown> | undefined)?.name;
  return typeof name === 'string' && name.trim() ? `${call.name} → ${name.trim()}` : call.name;
}

function listNotes(notes: AssistantNote[]): string {
  return notes.map((n) => `„${n.text}"`).join(', ');
}

function projectNotes(memory: AssistantMemory): MemoryCommandResult['notes'] {
  return memory.notes.map(({ id, text }) => ({ id, text }));
}

const UNAVAILABLE = 'Ich kann mir auf diesem Gerät nichts merken.';

/** Das Werkzeug `remember`: Die Rückmeldung ist ein fertiger Satz fürs Gespräch. */
export function runMemoryCommand(
  firecallId: string | undefined,
  command: MemoryCommand,
  storage: Storage | undefined = defaultStorage(),
  now = new Date(),
): MemoryCommandResult {
  if (!firecallId) {
    return { success: false, message: 'Ohne laufenden Einsatz kann ich mir nichts merken.', notes: [] };
  }

  switch (command.action) {
    case 'add': {
      const result = addNote(firecallId, command.text ?? '', storage, now);
      const notes = projectNotes(result.memory);
      if (result.ok) {
        return { success: true, message: `Gemerkt: „${result.note.text}".`, notes };
      }
      if (result.reason === 'full') {
        return {
          success: false,
          message:
            `Ich kann mir höchstens ${MAX_NOTES} Dinge merken. Gemerkt sind: ` +
            `${listNotes(result.memory.notes)}. Welche davon soll ich vergessen?`,
          notes,
        };
      }
      if (result.reason === 'empty') {
        return { success: false, message: 'Was soll ich mir merken?', notes };
      }
      return { success: false, message: UNAVAILABLE, notes };
    }

    case 'remove': {
      const result = removeNote(firecallId, command, storage, now);
      const notes = projectNotes(result.memory);
      if (result.ok) {
        return { success: true, message: `Vergessen: „${result.removed.text}".`, notes };
      }
      if (result.reason === 'ambiguous') {
        return {
          success: false,
          message: `Mehrere Notizen passen: ${listNotes(result.matches ?? [])}. Welche meinst du?`,
          notes,
        };
      }
      if (result.reason === 'notFound') {
        return {
          success: false,
          message:
            result.memory.notes.length > 0
              ? `Keine passende Notiz. Gemerkt sind: ${listNotes(result.memory.notes)}.`
              : 'Ich habe mir nichts gemerkt.',
          notes,
        };
      }
      return { success: false, message: UNAVAILABLE, notes };
    }

    case 'clear':
      return clearNotes(firecallId, storage, now)
        ? { success: true, message: 'Alle Notizen vergessen.', notes: [] }
        : { success: false, message: UNAVAILABLE, notes: [] };

    default:
      return {
        success: false,
        message: `Unbekannte Aktion „${String((command as { action: unknown }).action)}". Möglich: add, remove, clear.`,
        notes: [],
      };
  }
}
