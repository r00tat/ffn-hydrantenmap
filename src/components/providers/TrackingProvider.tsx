'use client';

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  isNativeTrackingAvailable,
  nativeStartTrack,
  nativeStopTrack,
  NativeTrackOpts,
} from '../../hooks/radiacode/nativeTrackBridge';
import {
  isNativeGpsTrackingAvailable,
  nativeStartGpsTrack,
  nativeStopGpsTrack,
  NativeGpsTrackOpts,
} from '../../hooks/recording/nativeGpsTrackBridge';
import { RadiacodeNotification } from '../../hooks/radiacode/radiacodeNotification';

export interface TrackingContextValue {
  isRadiacodeTracking: boolean;
  isGpsTracking: boolean;
  startRadiacodeTracking: (opts: NativeTrackOpts) => Promise<void>;
  stopRadiacodeTracking: () => Promise<void>;
  startGpsTracking: (opts: NativeGpsTrackOpts) => Promise<void>;
  stopGpsTracking: () => Promise<void>;
}

export const TrackingContext = createContext<TrackingContextValue | null>(null);

export function useTracking(): TrackingContextValue {
  const ctx = useContext(TrackingContext);
  if (!ctx) {
    throw new Error('useTracking must be used within a TrackingProvider');
  }
  return ctx;
}

interface TrackingProviderProps {
  children: ReactNode;
}

export function TrackingProvider({ children }: TrackingProviderProps) {
  const [isRadiacodeTracking, setIsRadiacodeTracking] = useState(false);
  const [isGpsTracking, setIsGpsTracking] = useState(false);

  // Sync with native state on mount
  useEffect(() => {
    if (isNativeTrackingAvailable() || isNativeGpsTrackingAvailable()) {
      if (typeof RadiacodeNotification.getState === 'function') {
        RadiacodeNotification.getState().then((state) => {
          setIsRadiacodeTracking(state.radiacodeTracking);
          setIsGpsTracking(state.gpsTracking);
        }).catch(err => {
          console.warn('[TrackingProvider] Failed to get native state', err);
        });
      } else {
        console.warn('[TrackingProvider] getState not available on native plugin (rebuild app?)');
      }
    }
  }, []);

  const startRadiacodeTracking = useCallback(async (opts: NativeTrackOpts) => {
    if (isNativeTrackingAvailable()) {
      await nativeStartTrack(opts);
    }
    setIsRadiacodeTracking(true);
  }, []);

  const stopRadiacodeTracking = useCallback(async () => {
    if (isNativeTrackingAvailable()) {
      await nativeStopTrack();
    }
    setIsRadiacodeTracking(false);
  }, []);

  const startGpsTracking = useCallback(async (opts: NativeGpsTrackOpts) => {
    if (isNativeGpsTrackingAvailable()) {
      await nativeStartGpsTrack(opts);
    }
    setIsGpsTracking(true);
  }, []);

  const stopGpsTracking = useCallback(async () => {
    if (isNativeGpsTrackingAvailable()) {
      await nativeStopGpsTrack();
    }
    setIsGpsTracking(false);
  }, []);

  const value = useMemo(() => ({
    isRadiacodeTracking,
    isGpsTracking,
    startRadiacodeTracking,
    stopRadiacodeTracking,
    startGpsTracking,
    stopGpsTracking,
  }), [
    isRadiacodeTracking,
    isGpsTracking,
    startRadiacodeTracking,
    stopRadiacodeTracking,
    startGpsTracking,
    stopGpsTracking,
  ]);

  return (
    <TrackingContext.Provider value={value}>
      {children}
    </TrackingContext.Provider>
  );
}
