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

    const originals = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
    };

    const capture = (level: 'INFO' | 'WARN' | 'ERROR') =>
      (...args: unknown[]) => {
        const msg = consoleSerialize(args);
        setMessages((old) => {
          const next: DebugMessage = {
            id: uuid(),
            message: msg,
            properties: { level, source: 'console' },
          };
          const trimmed =
            old.length >= MAX_CONSOLE_BUFFER
              ? old.slice(-(MAX_CONSOLE_BUFFER - 1))
              : old;
          return [...trimmed, next];
        });
      };

    const logCapture = capture('INFO');
    const infoCapture = capture('INFO');
    const warnCapture = capture('WARN');
    const errorCapture = capture('ERROR');

    console.log = (...args) => { originals.log(...args); logCapture(...args); };
    console.info = (...args) => { originals.info(...args); infoCapture(...args); };
    console.warn = (...args) => { originals.warn(...args); warnCapture(...args); };
    console.error = (...args) => { originals.error(...args); errorCapture(...args); };

    return () => {
      console.log = originals.log;
      console.info = originals.info;
      console.warn = originals.warn;
      console.error = originals.error;
    };
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
