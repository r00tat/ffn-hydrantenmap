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
      // External state change (firecall switch) requires reactive teardown.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsSharing(false);
      if (isNativeGpsTrackingAvailable()) {
        void nativeStopLiveShare().catch(() => {});
      }
    }
    previousFirecallRef.current = firecallId;
  }, [firecallId, isSharing, deleteOwn]);

  // Best-effort cleanup on unmount + beforeunload.
  // NOTE: This unconditionally deletes the doc on unmount. Task 10 will
  // refine this so we keep the doc alive while a native foreground service
  // is still pushing updates.
  useEffect(() => {
    if (!isSharing) return;
    const handler = () => {
      void deleteOwn();
    };
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
      void deleteOwn();
    };
  }, [isSharing, deleteOwn]);

  const start = useCallback(async () => {
    if (!uid || !firecallId || firecallId === 'unknown') return;
    setIsSharing(true);
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
    await deleteOwn();
    if (isNativeGpsTrackingAvailable()) {
      await nativeStopLiveShare().catch(() => {});
    }
  }, [deleteOwn]);

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
