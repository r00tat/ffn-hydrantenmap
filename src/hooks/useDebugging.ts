'use client';

import {
  Dispatch,
  SetStateAction,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { SimpleMap } from '../common/types';

import { getAnalytics, logEvent } from 'firebase/analytics';
import { v4 as uuid } from 'uuid';
import app from '../components/firebase/firebase';

export interface DebugLogging {
  info: (message: string, properties?: SimpleMap<any>) => Promise<void>;
  warn: (message: string, properties?: SimpleMap<any>) => Promise<void>;
  error: (message: string, properties?: SimpleMap<any>) => Promise<void>;
  messages: DebugMessage[];
  addMessage: (message: string, properties?: SimpleMap<any>) => DebugMessage;
  removeMessage: (id: string) => void;
  displayMessages: boolean;
  setDisplayMessages: Dispatch<SetStateAction<boolean>>;
}

export interface DebugMessage {
  id: string;
  message: string;
  properties?: SimpleMap<any>;
}

export const DebugLoggingContext = createContext<DebugLogging>({
  info: async (message, properties) => console.info(message, properties),
  warn: async (message, properties) => console.warn(message, properties),
  error: async (message, properties) => console.error(message, properties),
  messages: [],
  addMessage: (message, properties) => ({ id: '1', message, properties }),
  removeMessage: () => {},
  displayMessages: false,
  setDisplayMessages: () => {},
});

export const useDebugLogging = () => {
  return useContext(DebugLoggingContext);
};

export const useLoggingInfo = () => {
  return useDebugLogging().info;
};
export const useLoggingWarn = () => {
  return useDebugLogging().warn;
};
export const useLoggingError = () => {
  return useDebugLogging().error;
};

const MAX_CONSOLE_BUFFER = 500;

const consoleSerialize = (args: unknown[]): string =>
  args
    .map((a) => {
      if (typeof a === 'string') return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');

type ConsoleMethod = 'log' | 'info' | 'warn' | 'error';
type CaptureLevel = 'INFO' | 'WARN' | 'ERROR';
type CaptureListener = (level: CaptureLevel, message: string) => void;

const LEVEL_BY_METHOD: Record<ConsoleMethod, CaptureLevel> = {
  log: 'INFO',
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
};

/**
 * Die Umleitung von `console.*` haengt am Modul, nicht an der Hook-Instanz.
 *
 * Vorher merkte sich jede Instanz die Funktionen, die sie beim Einhaengen
 * vorfand, und stellte sie beim Ausschalten wieder her. Haengt der Provider
 * neu ein, waehrend die Umleitung laeuft, findet die zweite Instanz die
 * bereits umgeleiteten Funktionen vor und haelt sie fuer das Original —
 * Ausschalten stellt dann die Umleitung wieder her statt sie zu entfernen,
 * und die Aufzeichnung laeuft dauerhaft weiter.
 *
 * Mit einem Modul-Singleton kann das nicht passieren: Das Original wird genau
 * einmal gesichert (solange `nativeConsole` null ist, ist `console.*` echt),
 * und erst der letzte Abmelder baut die Umleitung zurueck.
 */
const captureListeners = new Set<CaptureListener>();
let nativeConsole: Pick<Console, ConsoleMethod> | null = null;

function installConsoleCapture(): void {
  if (nativeConsole) return;
  const native: Pick<Console, ConsoleMethod> = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
  nativeConsole = native;
  (Object.keys(LEVEL_BY_METHOD) as ConsoleMethod[]).forEach((method) => {
    console[method] = (...args: unknown[]) => {
      native[method](...args);
      const message = consoleSerialize(args);
      captureListeners.forEach((listener) =>
        listener(LEVEL_BY_METHOD[method], message),
      );
    };
  });
}

function uninstallConsoleCapture(): void {
  if (!nativeConsole) return;
  console.log = nativeConsole.log;
  console.info = nativeConsole.info;
  console.warn = nativeConsole.warn;
  console.error = nativeConsole.error;
  nativeConsole = null;
}

/** Meldet einen Mitleser an; der Rueckgabewert meldet ihn wieder ab. */
export function subscribeToConsole(listener: CaptureListener): () => void {
  captureListeners.add(listener);
  installConsoleCapture();
  return () => {
    captureListeners.delete(listener);
    if (captureListeners.size === 0) {
      uninstallConsoleCapture();
    }
  };
}

export const useFirebaseDebugging = (): DebugLogging => {
  const [messages, setMessages] = useState<DebugMessage[]>([]);
  const [displayMessages, setDisplayMessagesState] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('debugDisplayMessages') === 'true';
    }
    return false;
  });

  const setDisplayMessages: Dispatch<SetStateAction<boolean>> = useCallback(
    (action) => {
      setDisplayMessagesState((prev) => {
        const next = typeof action === 'function' ? action(prev) : action;
        localStorage.setItem('debugDisplayMessages', String(next));
        return next;
      });
    },
    [],
  );

  // While debug logging is enabled, mirror native console.* calls into the
  // in-memory message buffer so bug reports actually contain useful context.
  useEffect(() => {
    if (!displayMessages || typeof window === 'undefined') return;

    return subscribeToConsole((level, message) => {
      setMessages((old) => {
        const next: DebugMessage = {
          id: uuid(),
          message,
          properties: { level, source: 'console' },
        };
        const trimmed =
          old.length >= MAX_CONSOLE_BUFFER
            ? old.slice(-(MAX_CONSOLE_BUFFER - 1))
            : old;
        return [...trimmed, next];
      });
    });
  }, [displayMessages]);

  return useMemo((): DebugLogging => {
    const analytics = getAnalytics(app);

    const addMessage = (message: string, properties?: SimpleMap<any>) => {
      logEvent(analytics, message, properties);
      const msg: DebugMessage = {
        message,
        properties,
        id: uuid(),
      };
      setMessages((old) => [...old, msg]);
      return msg;
    };

    return {
      info: async (message, properties) => {
        console.info(message, properties);
        addMessage(message, { ...(properties || {}), level: 'INFO' });
      },
      warn: async (message, properties) => {
        console.info(message, properties);
        addMessage(message, { ...(properties || {}), level: 'WARN' });
      },
      error: async (message, properties) => {
        console.info(message, properties);
        addMessage(message, { ...(properties || {}), level: 'ERROR' });
      },
      addMessage,
      removeMessage: (id) => {
        setMessages((old) => old.filter((m) => m.id !== id));
      },
      displayMessages,
      setDisplayMessages,
      messages,
    };
  }, [displayMessages, setDisplayMessages, messages]);
};
