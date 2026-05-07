'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  isNativeGpsTrackingAvailable,
  nativeStartLiveShare,
  nativeStopLiveShare,
} from '../../hooks/recording/nativeGpsTrackBridge';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import { useFirecall, useFirecallId } from '../../hooks/useFirecall';
import { useLiveLocationShare } from '../../hooks/useLiveLocationShare';
import {
  LiveLocationSettings,
  useLiveLocationSettings,
} from '../../hooks/useLiveLocationSettings';
import { usePositionContext } from './PositionProvider';

const ACTIVE_STORAGE_KEY = 'liveLocationActive/v1';
// Auto-resume on reload only if the recorded session is recent enough.
const MAX_RESUME_AGE_MS = 12 * 60 * 60 * 1000;

interface PersistedActive {
  firecallId: string;
  uid: string;
  startedAt: number;
}

function loadActive(): PersistedActive | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as PersistedActive;
    if (
      typeof v.firecallId !== 'string' ||
      typeof v.uid !== 'string' ||
      typeof v.startedAt !== 'number'
    ) {
      return null;
    }
    if (Date.now() - v.startedAt > MAX_RESUME_AGE_MS) return null;
    return v;
  } catch {
    return null;
  }
}

function saveActive(v: PersistedActive | null): void {
  if (typeof window === 'undefined') return;
  if (v) {
    window.localStorage.setItem(ACTIVE_STORAGE_KEY, JSON.stringify(v));
  } else {
    window.localStorage.removeItem(ACTIVE_STORAGE_KEY);
  }
}

export interface LiveLocationContextValue {
  isSharing: boolean;
  settings: LiveLocationSettings;
  setSettings: (s: LiveLocationSettings) => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  canShare: boolean;
}

const LiveLocationContext = createContext<LiveLocationContextValue | null>(null);

export function LiveLocationProvider({ children }: { children: React.ReactNode }) {
  const [position, isPositionSet, location] = usePositionContext();
  const { uid, email, displayName } = useFirebaseLogin();
  const firecallId = useFirecallId();
  const firecall = useFirecall();

  const { settings, setSettings } = useLiveLocationSettings();
  const [isSharing, setIsSharing] = useState(false);

  const identity = useMemo(() => {
    if (!isSharing || !uid || !firecallId || firecallId === 'unknown') {
      return null;
    }
    return {
      firecallId,
      uid,
      name: displayName || email || '',
      email: email ?? '',
    };
  }, [isSharing, uid, firecallId, displayName, email]);

  const { maybeSend, deleteOwn } = useLiveLocationShare(identity, settings);

  // Push position updates while sharing.
  useEffect(() => {
    if (!isSharing || !isPositionSet) return;
    void maybeSend(position, location);
  }, [isSharing, isPositionSet, position, location, maybeSend]);

  // Auto-stop on firecall change: when the active firecall changes while
  // we are still sharing, tear down (delete the doc on the OLD path inside
  // useLiveLocationShare which still holds the old identity, then flip to
  // not-sharing). We deliberately leave restart up to the user.
  const previousFirecallRef = useRef(firecallId);
  useEffect(() => {
    if (previousFirecallRef.current !== firecallId && isSharing) {
      void deleteOwn();
      saveActive(null);
      // External state change (firecall switch) requires reactive teardown.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsSharing(false);
      if (isNativeGpsTrackingAvailable()) {
        void nativeStopLiveShare().catch(() => {});
      }
    }
    previousFirecallRef.current = firecallId;
  }, [firecallId, isSharing, deleteOwn]);

  const start = useCallback(async () => {
    if (!uid || !firecallId || firecallId === 'unknown') return;
    setIsSharing(true);
    saveActive({ firecallId, uid, startedAt: Date.now() });
    if (isNativeGpsTrackingAvailable()) {
      await nativeStartLiveShare({
        firecallId,
        uid,
        name: displayName || email || '',
        email: email ?? '',
        intervalMs: settings.heartbeatMs,
        distanceM: settings.distanceM,
        firecallName: firecall.name,
      }).catch((err) =>
        console.warn('[liveLocation] native start failed', err),
      );
    }
  }, [uid, firecallId, displayName, email, settings, firecall.name]);

  const stop = useCallback(async () => {
    setIsSharing(false);
    saveActive(null);
    await deleteOwn();
    if (isNativeGpsTrackingAvailable()) {
      await nativeStopLiveShare().catch(() => {});
    }
  }, [deleteOwn]);

  // Auto-resume on mount: if localStorage says we were sharing for the
  // current (firecallId, uid) and the recorded session is recent enough,
  // restart sharing without re-confirming. Survives page reloads.
  // Stale docs are cleaned by the Firestore TTL (1 h) and the 5-min UI hide,
  // so we deliberately do NOT delete the doc on unmount/beforeunload.
  const resumedRef = useRef(false);
  useEffect(() => {
    if (resumedRef.current) return;
    if (!uid || !firecallId || firecallId === 'unknown') return;
    const persisted = loadActive();
    if (!persisted) return;
    if (persisted.uid !== uid) return;
    if (persisted.firecallId !== firecallId) {
      // Drop entries from a different firecall.
      saveActive(null);
      return;
    }
    resumedRef.current = true;
    const t = setTimeout(() => {
      void start();
    }, 0);
    return () => clearTimeout(t);
  }, [uid, firecallId, start]);

  const canShare = isPositionSet && !!uid && firecallId !== 'unknown';

  const value: LiveLocationContextValue = {
    isSharing,
    settings,
    setSettings,
    start,
    stop,
    canShare,
  };

  return (
    <LiveLocationContext.Provider value={value}>
      {children}
    </LiveLocationContext.Provider>
  );
}

export default LiveLocationProvider;

export function useLiveLocationContext(): LiveLocationContextValue {
  const ctx = useContext(LiveLocationContext);
  if (!ctx) {
    throw new Error(
      'useLiveLocationContext must be used within LiveLocationProvider',
    );
  }
  return ctx;
}
