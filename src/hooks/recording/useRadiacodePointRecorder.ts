'use client';

import haversine from 'haversine-distance';
import { useEffect, useRef } from 'react';
import { FcMarker, FirecallItem } from '../../components/firebase/firestore';
import { decideShouldRecordPoint } from '../radiacode/sampleGate';
import {
  RadiacodeDeviceRef,
  RadiacodeMeasurement,
  SampleRateSpec,
} from '../radiacode/types';
import { isNativeTrackingAvailable } from '../radiacode/nativeTrackBridge';

export interface UseRadiacodePointRecorderParams {
  active: boolean;
  layerId: string;
  sampleRate: SampleRateSpec;
  device: RadiacodeDeviceRef | null;
  measurement: RadiacodeMeasurement | null;
  position: { lat: number; lng: number } | null;
  addItem: (item: FirecallItem) => Promise<{ id: string }>;
  firecallId: string;
  creatorEmail: string;
  firestoreDb?: string;
  onStart?: () => void | Promise<void>;
  onStop?: () => void | Promise<void>;
}

interface LastSample {
  lat: number;
  lng: number;
  time: number;
  doseUSvH: number;
}

function deviceLabel(device: RadiacodeDeviceRef | null): string {
  if (!device) return 'unknown';
  return `${device.name} (${device.serial})`;
}

export function useRadiacodePointRecorder({
  active,
  layerId,
  sampleRate,
  device,
  measurement,
  position,
  addItem,
  onStart,
  onStop,
}: UseRadiacodePointRecorderParams): void {
  const native = isNativeTrackingAvailable();
  const lastSampleRef = useRef<LastSample | null>(null);
  const writingRef = useRef(false);

  // Management of onStart/onStop callbacks for web
  useEffect(() => {
    if (!active || native) return;
    
    Promise.resolve(onStart?.()).catch((err) =>
      console.error('[RADIACODE] onStart failed', err),
    );
    return () => {
      Promise.resolve(onStop?.()).catch((err) =>
        console.error('[RADIACODE] onStop failed', err),
      );
    };
  }, [active, native, onStart, onStop]);

  // Web-side recording logic
  useEffect(() => {
    if (!active) {
      lastSampleRef.current = null;
      return;
    }
    if (native) return; // native writes in Foreground-Service
    if (!measurement || !position) return;
    if (writingRef.current) return;
    // Guard non-finite dose so NaN/Infinity doesn't poison the delta gate.
    if (!Number.isFinite(measurement.dosisleistung)) return;

    const now = Date.now();
    const last = lastSampleRef.current;

    let shouldWrite: boolean;
    if (!last) {
      shouldWrite = true;
    } else {
      const distanceMeters = haversine(
        { lat: last.lat, lng: last.lng },
        { lat: position.lat, lng: position.lng },
      );
      const secondsSinceLast = (now - last.time) / 1000;
      const doseRateDeltaUSvH = measurement.dosisleistung - last.doseUSvH;
      shouldWrite = decideShouldRecordPoint({
        distanceMeters,
        dtSec: secondsSinceLast,
        doseRateDeltaUSvH,
        rate: sampleRate,
      });
    }

    if (!shouldWrite) return;

    writingRef.current = true;
    const marker: FcMarker = {
      type: 'marker',
      name: `${measurement.dosisleistung.toFixed(3)} µSv/h`,
      layer: layerId,
      lat: position.lat,
      lng: position.lng,
      fieldData: {
        dosisleistung: measurement.dosisleistung,
        ...(measurement.dosisleistungErrPct !== undefined && {
          dosisleistungErrPct: measurement.dosisleistungErrPct,
        }),
        cps: measurement.cps,
        ...(measurement.cpsErrPct !== undefined && {
          cpsErrPct: measurement.cpsErrPct,
        }),
        device: deviceLabel(device),
      },
    };
    lastSampleRef.current = {
      lat: position.lat,
      lng: position.lng,
      time: now,
      doseUSvH: measurement.dosisleistung,
    };

    addItem(marker).finally(() => {
      writingRef.current = false;
    });
  }, [active, layerId, sampleRate, device, measurement, position, addItem, native]);
}
