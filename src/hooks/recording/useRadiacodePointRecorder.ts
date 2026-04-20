import haversine from 'haversine-distance';
import { useEffect, useRef } from 'react';
import { FcMarker, FirecallItem } from '../../components/firebase/firestore';
import { shouldSamplePoint } from '../radiacode/sampling';
import {
  RATE_CONFIG,
  RadiacodeDeviceRef,
  RadiacodeMeasurement,
  SampleRate,
} from '../radiacode/types';

export interface UseRadiacodePointRecorderParams {
  active: boolean;
  layerId: string;
  sampleRate: SampleRate;
  device: RadiacodeDeviceRef | null;
  measurement: RadiacodeMeasurement | null;
  position: { lat: number; lng: number } | null;
  addItem: (item: FirecallItem) => Promise<{ id: string }>;
}

export interface UseRadiacodePointRecorderResult {
  samplesWritten: number;
}

interface LastSample {
  lat: number;
  lng: number;
  time: number;
}

export function useRadiacodePointRecorder({
  active,
  layerId,
  sampleRate,
  device,
  measurement,
  position,
  addItem,
}: UseRadiacodePointRecorderParams): UseRadiacodePointRecorderResult {
  const lastSampleRef = useRef<LastSample | null>(null);
  const samplesRef = useRef(0);
  const writingRef = useRef(false);

  useEffect(() => {
    if (!active) {
      lastSampleRef.current = null;
      return;
    }
    if (!measurement || !position) return;
    if (writingRef.current) return;

    const now = Date.now();
    const last = lastSampleRef.current;
    const config = RATE_CONFIG[sampleRate];

    let shouldWrite: boolean;
    if (!last) {
      shouldWrite = true;
    } else {
      const distanceMeters = haversine(
        { lat: last.lat, lng: last.lng },
        { lat: position.lat, lng: position.lng },
      );
      const secondsSinceLast = (now - last.time) / 1000;
      shouldWrite = shouldSamplePoint({
        distanceMeters,
        secondsSinceLast,
        config,
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
        cps: measurement.cps,
        device: device ? `${device.name} (${device.serial})` : 'unknown',
      },
    };
    lastSampleRef.current = { lat: position.lat, lng: position.lng, time: now };
    samplesRef.current += 1;

    addItem(marker).finally(() => {
      writingRef.current = false;
    });
  }, [active, layerId, sampleRate, device, measurement, position, addItem]);

  return { samplesWritten: samplesRef.current };
}
