'use client';

import L from 'leaflet';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useGpsLineRecorder } from '../../hooks/recording/useGpsLineRecorder';
import { useRadiacodePointRecorder } from '../../hooks/recording/useRadiacodePointRecorder';
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
import { SampleRateSpec } from '../../hooks/radiacode/types';
import { RadiacodeDeviceRef } from '../../hooks/radiacode/types';
import { useRadiacode } from './RadiacodeProvider';
import { usePositionContext } from './PositionProvider';
import { useFirecallId } from '../../hooks/useFirecall';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';

export type GpsRecordingMode = 'gps' | 'radiacode';

export interface GpsProviderContextValue {
  isRecording: boolean;
  mode: GpsRecordingMode | null;
  isRadiacodeTracking: boolean; // Native status
  isGpsTracking: boolean; // Native status
  
  // Configuration
  layerId: string | null;
  sampleRate: SampleRateSpec;
  device: RadiacodeDeviceRef | null;

  // Actions
  startGpsRecording: (layerId: string, sampleRate: SampleRateSpec) => Promise<void>;
  startRadiacodeRecording: (device: RadiacodeDeviceRef, layerId: string, sampleRate: SampleRateSpec) => Promise<void>;
  stopRecording: () => Promise<void>;
}

export default GpsProvider;

export const GpsProviderContext = createContext<GpsProviderContextValue | null>(null);

export function useGpsProvider(): GpsProviderContextValue {
  const ctx = useContext(GpsProviderContext);
  if (!ctx) {
    throw new Error('useGpsProvider must be used within a GpsProvider');
  }
  return ctx;
}

interface GpsProviderProps {
  children: ReactNode;
}

export function GpsProvider({ children }: GpsProviderProps) {
  const [isRadiacodeTracking, setIsRadiacodeTracking] = useState(false);
  const [isGpsTracking, setIsGpsTracking] = useState(false);
  
  const [mode, setMode] = useState<GpsRecordingMode | null>(null);
  const [layerId, setLayerId] = useState<string | null>(null);
  const [sampleRate, setSampleRate] = useState<SampleRateSpec>('normal');
  const [device, setDevice] = useState<RadiacodeDeviceRef | null>(null);

  const [position, isPositionSet] = usePositionContext();
  const { measurement, device: radiacodeDevice } = useRadiacode();
  const firecallId = useFirecallId();
  const { email: creatorEmail } = useFirebaseLogin();
  const addFirecallItem = useFirecallItemAdd();
  const firestoreDb = process.env.NEXT_PUBLIC_FIRESTORE_DB || '';

  // Sync with native state on mount
  useEffect(() => {
    if (isNativeTrackingAvailable() || isNativeGpsTrackingAvailable()) {
      if (typeof RadiacodeNotification.getState === 'function') {
        RadiacodeNotification.getState().then((state) => {
          setIsRadiacodeTracking(state.radiacodeTracking);
          setIsGpsTracking(state.gpsTracking);
          
          if (state.radiacodeTracking) {
            setMode('radiacode');
          } else if (state.gpsTracking) {
            setMode('gps');
          }
        }).catch(err => {
          console.warn('[GpsProvider] Failed to get native state', err);
        });
      }
    }
  }, []);

  const gpsRecorder = useGpsLineRecorder({
    active: mode === 'gps',
    layerId: layerId,
    sampleRate: sampleRate,
  });

  useRadiacodePointRecorder({
    active: mode === 'radiacode',
    layerId: layerId ?? '',
    sampleRate: sampleRate,
    device: radiacodeDevice,
    measurement,
    position: isPositionSet ? { lat: position.lat, lng: position.lng } : null,
    addItem: addFirecallItem,
    firecallId: firecallId ?? '',
    creatorEmail: creatorEmail ?? '',
    firestoreDb,
  });

  const isRecording = mode !== null || isRadiacodeTracking || isGpsTracking;
const startRadiacodeRecording = useCallback(async (d: RadiacodeDeviceRef, lId: string, rate: SampleRateSpec) => {
  setMode('radiacode');
  setLayerId(lId);
  setSampleRate(rate);
  setDevice(d);
  setIsRadiacodeTracking(true);

  if (isNativeTrackingAvailable()) {
    await nativeStartTrack({
      firecallId: firecallId ?? '',
      layerId: lId,
      sampleRate: rate,
      deviceLabel: `${d.name} (${d.serial})`,
      creator: creatorEmail ?? '',
      firestoreDb,
    }).catch(err => console.error('[GpsProvider] nativeStartTrack failed', err));
  }
}, [firecallId, creatorEmail, firestoreDb]);

const startGpsRecording = useCallback(async (lId: string, rate: SampleRateSpec) => {
  setMode('gps');
  setLayerId(lId);
  setSampleRate(rate);
  setIsGpsTracking(true);

  if (isPositionSet) {
    // For GPS mode, the gpsRecorder (web) handles the native bridge itself
    // OR we handle it here. Looking at useGpsLineRecorder, it handles it.
    // But we should be consistent.
    await gpsRecorder.startRecording(L.latLng(position), rate);
  }
}, [gpsRecorder, isPositionSet, position]);

  const stopRecording = useCallback(async () => {
    if (mode === 'gps' && isPositionSet) {
      await gpsRecorder.stopRecording(L.latLng(position));
    }
    
    setMode(null);
    setLayerId(null);
    setDevice(null);
    setIsRadiacodeTracking(false);
    setIsGpsTracking(false);
    
    if (isNativeTrackingAvailable()) {
      await nativeStopTrack().catch(() => null);
    }
    if (isNativeGpsTrackingAvailable()) {
      await nativeStopGpsTrack().catch(() => null);
    }
  }, [gpsRecorder, isPositionSet, mode, position]);

  const value = useMemo(() => ({
    isRecording,
    mode,
    isRadiacodeTracking,
    isGpsTracking,
    layerId,
    sampleRate,
    device,
    startGpsRecording,
    startRadiacodeRecording,
    stopRecording,
  }), [
    isRecording,
    mode,
    isRadiacodeTracking,
    isGpsTracking,
    layerId,
    sampleRate,
    device,
    startGpsRecording,
    startRadiacodeRecording,
    stopRecording,
  ]);

  return (
    <GpsProviderContext.Provider value={value}>
      {children}
    </GpsProviderContext.Provider>
  );
}

