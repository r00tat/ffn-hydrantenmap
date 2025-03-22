'use client';

import {
  Dispatch,
  SetStateAction,
  createContext,
  useContext,
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

export const useFirebaseDebugging = (): DebugLogging => {
  const [messages, setMessages] = useState<DebugMessage[]>([]);
  const [displayMessages, setDisplayMessages] = useState(false);

  const funcs = useMemo((): DebugLogging => {
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
      displayMessages: false,
      setDisplayMessages,
      messages: [],
    };
  }, []);

  return { ...funcs, messages, displayMessages, setDisplayMessages };
};
