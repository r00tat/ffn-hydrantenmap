'use client';

import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import {
  HOTKEY_ACTIONS,
  getHotkeyAction,
  matchesBinding,
  normalizeBinding,
  resolveBindings,
  type HotkeyActionId,
  type HotkeyBindings,
  type HotkeyOverrides,
} from '../../common/hotkeys';

/**
 * Tastenkürzel der App.
 *
 * Ein Listener am `window` (Capture-Phase, damit er auch hinter einem offenen
 * Dialog noch etwas mitbekommt) gleicht jeden Tastendruck mit den Kürzeln ab
 * und ruft den Handler der Aktion. Handler melden sich mit `useHotkey` an; je
 * Aktion gewinnt der zuletzt angemeldete — so kann die Karte `/` für ihre
 * Suche übernehmen, solange sie offen ist, und danach greift wieder der
 * globale Handler.
 *
 * Die Belegung liegt je Gerät im `localStorage`: Tastaturen und Gewohnheiten
 * unterscheiden sich je Gerät, und ein Tablet ohne Tastatur braucht sie gar
 * nicht. Siehe docs/tastenkuerzel.md.
 */

export const HOTKEY_STORAGE_KEY = 'einsatzkarte.hotkeys.v1';

/** Gibt ein Handler `false` zurück, gilt der Tastendruck als nicht behandelt. */
export type HotkeyHandler = (event: KeyboardEvent) => boolean | void;

interface StoredHotkeys {
  enabled: boolean;
  overrides: HotkeyOverrides;
}

export interface HotkeyContextValue {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  bindings: HotkeyBindings;
  overrides: HotkeyOverrides;
  /** `null` schaltet das Kürzel ab. */
  setBinding: (id: HotkeyActionId, binding: string | null) => void;
  resetBinding: (id: HotkeyActionId) => void;
  resetAll: () => void;
  register: (id: HotkeyActionId, handler: HotkeyHandler) => () => void;
  /** Für Aufnahme-Felder: solange > 0 feuert kein Kürzel. */
  suspend: () => () => void;
  /** Führt eine Aktion aus, als wäre ihr Kürzel gedrückt worden. */
  trigger: (id: HotkeyActionId) => boolean;
}

const defaultBindings = resolveBindings({});

const HotkeyContext = createContext<HotkeyContextValue>({
  enabled: false,
  setEnabled: () => {},
  bindings: defaultBindings,
  overrides: {},
  setBinding: () => {},
  resetBinding: () => {},
  resetAll: () => {},
  register: () => () => {},
  suspend: () => () => {},
  trigger: () => false,
});

export function useHotkeys(): HotkeyContextValue {
  return useContext(HotkeyContext);
}

function readStored(): StoredHotkeys {
  try {
    const raw = window.localStorage.getItem(HOTKEY_STORAGE_KEY);
    if (!raw) return { enabled: true, overrides: {} };
    const parsed = JSON.parse(raw) as Partial<StoredHotkeys>;
    return {
      enabled: parsed.enabled !== false,
      overrides:
        parsed.overrides && typeof parsed.overrides === 'object'
          ? parsed.overrides
          : {},
    };
  } catch {
    return { enabled: true, overrides: {} };
  }
}

function writeStored(value: StoredHotkeys) {
  try {
    window.localStorage.setItem(HOTKEY_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Privater Modus oder voller Speicher: die Änderung gilt dann nur bis zum
    // Neuladen, das ist verschmerzbar.
  }
}

const SERVER_SNAPSHOT: StoredHotkeys = { enabled: true, overrides: {} };
let storedSnapshot: StoredHotkeys | null = null;
const storedListeners = new Set<() => void>();

function getServerSnapshot(): StoredHotkeys {
  return SERVER_SNAPSHOT;
}

function getStoredSnapshot(): StoredHotkeys {
  if (storedSnapshot === null) storedSnapshot = readStored();
  return storedSnapshot;
}

function setStoredSnapshot(value: StoredHotkeys) {
  storedSnapshot = value;
  writeStored(value);
  storedListeners.forEach((listener) => listener());
}

function subscribeStored(listener: () => void): () => void {
  storedListeners.add(listener);
  // Änderungen aus einem anderen Tab übernehmen.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== HOTKEY_STORAGE_KEY) return;
    storedSnapshot = readStored();
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    storedListeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** Nur für Tests: zwischengespeicherten Stand verwerfen. */
export function resetHotkeyStoreForTests() {
  storedSnapshot = null;
}

/** Fokus in einem Feld, in dem getippt wird? */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== 'string') {
    return false;
  }
  const element = target as HTMLElement;
  const tag = element.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = ((element as HTMLInputElement).type || 'text').toLowerCase();
    return ![
      'button',
      'checkbox',
      'radio',
      'range',
      'reset',
      'submit',
      'color',
      'file',
    ].includes(type);
  }
  return element.isContentEditable === true;
}

/**
 * Ein modaler Dialog, ein Menü oder ein Overlay, das Kürzel sperrt, ist
 * offen. MUI hängt geschlossene, aber gemountete Modals mit `MuiModal-hidden`
 * aus.
 */
export function isModalOpen(): boolean {
  if (typeof document === 'undefined') return false;
  return (
    document.querySelector(
      '.MuiModal-root:not(.MuiModal-hidden), [data-hotkeys-block="true"]',
    ) !== null
  );
}

export default function HotkeyProvider({ children }: { children: ReactNode }) {
  // `localStorage` gibt es beim Server-Rendering nicht; dort und beim
  // Hydrieren gilt die Vorbelegung, danach der gespeicherte Stand.
  const stored = useSyncExternalStore(
    subscribeStored,
    getStoredSnapshot,
    getServerSnapshot,
  );

  const update = useCallback(
    (updater: (prev: StoredHotkeys) => StoredHotkeys) => {
      setStoredSnapshot(updater(getStoredSnapshot()));
    },
    [],
  );

  const bindings = useMemo(
    () => resolveBindings(stored.overrides),
    [stored.overrides],
  );

  const handlersRef = useRef(new Map<HotkeyActionId, HotkeyHandler[]>());
  const suspendedRef = useRef(0);
  const bindingsRef = useRef(bindings);
  const enabledRef = useRef(stored.enabled);
  useEffect(() => {
    bindingsRef.current = bindings;
    enabledRef.current = stored.enabled;
  }, [bindings, stored.enabled]);

  const register = useCallback(
    (id: HotkeyActionId, handler: HotkeyHandler) => {
      const map = handlersRef.current;
      map.set(id, [...(map.get(id) ?? []), handler]);
      return () => {
        const list = map.get(id) ?? [];
        map.set(
          id,
          list.filter((h) => h !== handler),
        );
      };
    },
    [],
  );

  const suspend = useCallback(() => {
    suspendedRef.current += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      suspendedRef.current -= 1;
    };
  }, []);

  const runHandlers = useCallback(
    (id: HotkeyActionId, event: KeyboardEvent): boolean => {
      const list = handlersRef.current.get(id) ?? [];
      // Der zuletzt angemeldete Handler hat Vorrang.
      for (let i = list.length - 1; i >= 0; i -= 1) {
        if (list[i](event) !== false) return true;
      }
      return false;
    },
    [],
  );

  const trigger = useCallback(
    (id: HotkeyActionId) =>
      runHandlers(id, new KeyboardEvent('keydown', { key: '' })),
    [runHandlers],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!enabledRef.current || suspendedRef.current > 0) return;
      if (event.defaultPrevented || event.repeat || event.isComposing) return;

      const editable = isEditableTarget(event.target);
      const modalOpen = isModalOpen();

      for (const action of HOTKEY_ACTIONS) {
        const id = action.id as HotkeyActionId;
        const binding = bindingsRef.current[id];
        if (!binding || !matchesBinding(event, binding)) continue;
        const definition = getHotkeyAction(id);
        if (editable && !definition?.allowInInputs) continue;
        if (modalOpen && !definition?.whileDialogOpen) continue;
        if (runHandlers(id, event)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [runHandlers]);

  const value = useMemo<HotkeyContextValue>(
    () => ({
      enabled: stored.enabled,
      setEnabled: (enabled) => update((prev) => ({ ...prev, enabled })),
      bindings,
      overrides: stored.overrides,
      setBinding: (id, binding) =>
        update((prev) => ({
          ...prev,
          overrides: {
            ...prev.overrides,
            [id]: binding === null ? null : normalizeBinding(binding),
          },
        })),
      resetBinding: (id) =>
        update((prev) => {
          const overrides = { ...prev.overrides };
          delete overrides[id];
          return { ...prev, overrides };
        }),
      resetAll: () => update((prev) => ({ ...prev, overrides: {} })),
      register,
      suspend,
      trigger,
    }),
    [stored, bindings, update, register, suspend, trigger],
  );

  return (
    <HotkeyContext.Provider value={value}>{children}</HotkeyContext.Provider>
  );
}

/**
 * Meldet einen Handler für eine Aktion an, solange die Komponente gemountet
 * und `enabled` ist. Der Handler darf sich bei jedem Rendern ändern.
 */
export function useHotkey(
  id: HotkeyActionId,
  handler: HotkeyHandler,
  enabled = true,
): void {
  const { register } = useHotkeys();
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled) return;
    return register(id, (event) => handlerRef.current(event));
  }, [id, enabled, register]);
}
