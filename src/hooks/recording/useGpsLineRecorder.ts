'use client';

import L, { LatLng } from 'leaflet';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LatLngPosition } from '../../common/geo';
import { formatTimestamp } from '../../common/time-format';
import { usePositionContext } from '../../components/providers/PositionProvider';
import { calculateDistance } from '../../components/FirecallItems/elements/connection/distance';
import { Line } from '../../components/firebase/firestore';
import { toLatLng } from '../leafletFunctions';
import { useDebugLogging } from '../useDebugging';
import useFirecallItemAdd from '../useFirecallItemAdd';
import useFirecallItemUpdate from '../useFirecallItemUpdate';
import { SampleRateSpec } from '../radiacode/types';
import {
  isNativeGpsTrackingAvailable,
  nativeStartGpsTrack,
  nativeStopGpsTrack,
} from './nativeGpsTrackBridge';
import useFirebaseLogin from '../useFirebaseLogin';
import { useFirecallId } from '../useFirecall';

export interface UseGpsLineRecorderParams {
  active: boolean;
  layerId: string | null;
  sampleRate: SampleRateSpec;
  onStart?: () => void;
  onStop?: () => void;
}

export interface UseGpsLineRecorderResult {
  isRecording: boolean;
  startRecording: (pos: LatLng, sampleRate?: SampleRateSpec) => Promise<void>;
  stopRecording: (pos: LatLng) => Promise<void>;
}

export function useGpsLineRecorder({
  active,
  sampleRate,
}: UseGpsLineRecorderParams): UseGpsLineRecorderResult {
  const [recordItem, setRecordItem] = useState<Line>();
  const [positions, setPositions] = useState<LatLngPosition[]>([]);
  const [timestamp, setTimestamp] = useState(new Date());
  const [currentTime, setCurrentTime] = useState(new Date());
  const backendRef = useRef<'native' | 'web' | null>(null);

  const [position, isPositionSet] = usePositionContext();
  const updateFirecallItem = useFirecallItemUpdate();
  const addFirecallItem = useFirecallItemAdd();
  const { info, warn } = useDebugLogging();

  const firecallId = useFirecallId();
  const { email: creatorEmail } = useFirebaseLogin();
  const firestoreDb = process.env.NEXT_PUBLIC_FIRESTORE_DB || '';

  const isRecording = active;

  const addPos = useCallback(
    async (newPos: LatLngPosition, record: Line) => {
      if (record.id) {
        info(`[TRACK] adding new position to track`, {
          track: record.id,
          pos: newPos,
        });
        const allPos: LatLngPosition[] = [
          ...JSON.parse(record.positions || '[]'),
          newPos,
        ];
        setPositions((p) => [...p, newPos]);
        const newRecord: Line = {
          ...record,
          positions: JSON.stringify(allPos),
          destLat: newPos[0],
          destLng: newPos[1],
          distance: calculateDistance(allPos),
        };
        await updateFirecallItem(newRecord);
        setRecordItem(newRecord);
      } else {
        warn(`[TRACK] tracking not possible, record id undefined`);
      }
    },
    [updateFirecallItem, info, warn],
  );

  const startRecording = useCallback(
    async (pos: LatLng, rate?: SampleRateSpec) => {
      if (isPositionSet) {
        const newRecord: Line = {
          type: 'line',
          name: `Track ${formatTimestamp(new Date())}`,
          lat: pos.lat,
          lng: pos.lng,
          positions: JSON.stringify([[pos.lat, pos.lng]]),
          destLat: pos.lat,
          destLng: pos.lng,
          color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
        };
        setPositions([[pos.lat, pos.lng]]);
        const ref = await addFirecallItem(newRecord);
        newRecord.id = ref.id;
        setRecordItem(newRecord);

        const backend: 'native' | 'web' = isNativeGpsTrackingAvailable()
          ? 'native'
          : 'web';
        backendRef.current = backend;
        if (backend === 'native') {
          try {
            await nativeStartGpsTrack({
              firecallId: firecallId ?? '',
              lineId: ref.id,
              firestoreDb,
              creator: creatorEmail ?? '',
              sampleRate: rate ?? sampleRate,
              initialLat: pos.lat,
              initialLng: pos.lng,
            });
          } catch (err) {
            warn('[TRACK] startGpsTracking failed, falling back to web', {
              err,
            });
            backendRef.current = 'web';
          }
        }

        info(`[TRACK] starting track`, {
          trackTitle: newRecord.name,
          track: newRecord.id,
          pos,
          backend: backendRef.current,
        });
      }
    },
    [
      addFirecallItem,
      isPositionSet,
      info,
      warn,
      firecallId,
      firestoreDb,
      creatorEmail,
      sampleRate,
    ],
  );

  const stopRecording = useCallback(
    async (pos: LatLng) => {
      const backend = backendRef.current;
      if (backend === 'native') {
        try {
          await nativeStopGpsTrack();
        } catch (err) {
          warn('[TRACK] stopGpsTracking failed', { err });
        }
      } else if (recordItem) {
        await addPos([pos.lat, pos.lng], recordItem);
      }
      backendRef.current = null;
      setPositions([]);
      setRecordItem(undefined);
    },
    [addPos, recordItem, warn],
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 2000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (backendRef.current !== 'web') return;
    if (isRecording && isPositionSet && recordItem) {
      const lastPos = positions[positions.length - 1];
      const distance = L.latLng(position).distanceTo(
        toLatLng(lastPos[0], lastPos[1]),
      );

      const timeSinceLastPos = (+currentTime - +timestamp) / 1000;
      if ((distance > 5 && timeSinceLastPos > 1) || timeSinceLastPos > 15) {
        info(`[TRACK] updating pos`, {
          track: recordItem.id,
          pos: position.toString(),
        });
        (async () => {
          setTimestamp(new Date());
          addPos([position.lat, position.lng], recordItem);
        })();
      } else {
        if (timeSinceLastPos > 10) {
          info(`[TRACK] distance or time to small`, {
            track: recordItem.id,
            pos: position.toString(),
            lastPos: lastPos,
            timeSinceLastPos,
          });
        }
      }
    }
  }, [
    addPos,
    currentTime,
    isPositionSet,
    isRecording,
    position,
    positions,
    recordItem,
    timestamp,
    info,
  ]);

  return { isRecording, startRecording, stopRecording };
}

/** @internal Visible for tests. */
export function __testing_decideBackend(): 'native' | 'web' {
  return isNativeGpsTrackingAvailable() ? 'native' : 'web';
}
