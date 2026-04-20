import L, { LatLng } from 'leaflet';
import { useCallback, useEffect, useState } from 'react';
import { useMap } from 'react-leaflet';
import { LatLngPosition } from '../../common/geo';
import { formatTimestamp } from '../../common/time-format';
import { usePositionContext } from '../../components/Map/Position';
import { calculateDistance } from '../../components/FirecallItems/elements/connection/distance';
import { Line } from '../../components/firebase/firestore';
import { toLatLng } from '../leafletFunctions';
import { useDebugLogging } from '../useDebugging';
import useFirecallItemAdd from '../useFirecallItemAdd';
import useFirecallItemUpdate from '../useFirecallItemUpdate';

export interface UseGpsLineRecorderResult {
  isRecording: boolean;
  startRecording: (pos: LatLng) => Promise<void>;
  stopRecording: (pos: LatLng) => Promise<void>;
}

export function useGpsLineRecorder(): UseGpsLineRecorderResult {
  const [isRecording, setIsRecording] = useState(false);
  const [recordItem, setRecordItem] = useState<Line>();
  const [positions, setPositions] = useState<LatLngPosition[]>([]);
  const [timestamp, setTimestamp] = useState(new Date());
  const [currentTime, setCurrentTime] = useState(new Date());

  const [position, isPositionSet] = usePositionContext();
  const map = useMap();
  const updateFirecallItem = useFirecallItemUpdate();
  const addFirecallItem = useFirecallItemAdd();
  const { info, warn } = useDebugLogging();

  const addPos = useCallback(
    async (newPos: LatLngPosition, record: Line) => {
      if (recordItem?.id) {
        info(`[TRACK] adding new position to track`, {
          track: recordItem.id,
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
    [recordItem, updateFirecallItem, info, warn],
  );

  const startRecording = useCallback(
    async (pos: LatLng) => {
      if (isPositionSet) {
        map.setView(position);
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
        setIsRecording(true);
        info(`[TRACK] starting track`, {
          trackTitle: newRecord.name,
          track: newRecord.id,
          pos,
        });
      }
    },
    [addFirecallItem, isPositionSet, map, position, info],
  );

  const stopRecording = useCallback(
    async (pos: LatLng) => {
      if (recordItem) {
        await addPos([pos.lat, pos.lng], recordItem);
      }
      setPositions([]);
      setRecordItem(undefined);
      setIsRecording(false);
    },
    [addPos, recordItem],
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 2000);

    return () => {
      clearInterval(interval);
    };
  });

  useEffect(() => {
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
        map.setView(position);
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
    map,
    position,
    positions,
    recordItem,
    timestamp,
    info,
  ]);

  return { isRecording, startRecording, stopRecording };
}
