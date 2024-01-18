import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import { Tooltip } from '@mui/material';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import { useCallback, useEffect, useState } from 'react';
import { LatLngPosition } from '../../common/geo';
import { formatTimestamp } from '../../common/time-format';
import { toLatLng } from '../../hooks/constants';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';
import useFirecallItemUpdate from '../../hooks/useFirecallItemUpdate';
import { calculateDistance } from '../FirecallItems/elements/connection/distance';
import { Line } from '../firebase/firestore';
import { usePositionContext } from './Position';
import { LatLng } from 'leaflet';
import { useMap } from 'react-leaflet';

export default function RecordButton() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordItem, setRecordItem] = useState<Line>();
  const [positions, setPositions] = useState<LatLngPosition[]>([]);
  const [timestamp, setTimestamp] = useState(new Date());
  const [currentTime, setCurrentTime] = useState(new Date());

  const [position, isPositionSet] = usePositionContext();
  const map = useMap();
  const updateFirecallItem = useFirecallItemUpdate();
  const addFirecallItem = useFirecallItemAdd();

  const addPos = useCallback(
    async (newPos: LatLngPosition, record: Line) => {
      if (recordItem?.id) {
        console.info(
          `adding new position to track ${recordItem.id}: ${newPos}`
        );
        // we need an id to update the item
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
        console.warn(`tracking not possible, record id undefined`);
      }
    },
    [recordItem, updateFirecallItem]
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
        };
        setPositions([[pos.lat, pos.lng]]);
        const ref = await addFirecallItem(newRecord);
        newRecord.id = ref.id;
        setRecordItem(newRecord);
        setIsRecording(true);
        console.info(`starting track ${newRecord.name} ${newRecord.id} ${pos}`);
      }
    },
    [addFirecallItem, isPositionSet, map, position]
  );

  const stopRecording = useCallback(
    async (pos: LatLng) => {
      if (recordItem) {
        addPos([pos.lat, pos.lng], recordItem);
      }
      setPositions([]);
      setRecordItem(undefined);
      setIsRecording(false);
    },
    [addPos, recordItem]
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 3000);

    return () => {
      clearInterval(interval);
    };
  });

  useEffect(() => {
    if (isRecording && isPositionSet && recordItem && positions.length > 0) {
      const lastPos = positions[positions.length - 1];
      const distance = position.distanceTo(toLatLng(lastPos[0], lastPos[1]));

      // more than 5m and > 1 sec or > 30 seconds

      const timeSinceLastPos = (+currentTime - +timestamp) / 1000;
      if ((distance > 5 && timeSinceLastPos > 1) || timeSinceLastPos > 30) {
        map.setView(position);
        setTimestamp(new Date());
        addPos([lastPos[0], lastPos[1]], recordItem);
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
  ]);

  return (
    <Box
      sx={{
        // '& > :not(style)': { m: 1 },
        position: 'absolute',
        bottom: 96,
        left: 16,
      }}
    >
      {isPositionSet && (
        <Tooltip title="GPS Track aufzeichnen">
          <Fab
            color={isRecording ? 'warning' : 'default'}
            aria-label="add"
            size="small"
            onClick={(event) => {
              event.preventDefault();
              if (isRecording) {
                stopRecording(position);
              } else {
                startRecording(position);
              }
            }}
          >
            <RadioButtonCheckedIcon />
          </Fab>
        </Tooltip>
      )}
    </Box>
  );
}
