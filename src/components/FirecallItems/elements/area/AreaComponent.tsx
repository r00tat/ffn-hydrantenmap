import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { IconButton } from '@mui/material';
import L from 'leaflet';
import { useMemo, useState } from 'react';
import { Marker, Polygon, Popup } from 'react-leaflet';
import { LatLngPosition, latLngPosition } from '../../../../common/geo';
import { useFirecallId } from '../../../../hooks/useFirecall';
import { FirecallItem } from '../../../firebase/firestore';
import { FirecallArea } from '../FirecallArea';
import {
  deleteFirecallPosition,
  updateFirecallPositions,
} from '../connection/positions';

export interface AreaMarkerProps {
  record: FirecallArea;
  selectItem: (item: FirecallItem) => void;
}

export default function AreaMarker({ record, selectItem }: AreaMarkerProps) {
  const firecallId = useFirecallId();
  const [showMarkers, setShowMarkers] = useState(false);

  const positions: LatLngPosition[] = useMemo(() => {
    let p: LatLngPosition[] = [
      latLngPosition(record.lat, record.lng),
      [record.destLat, record.destLng],
    ];

    try {
      if (record.positions) {
        p = JSON.parse(record.positions);
      }
    } catch (err) {
      console.warn(`unable to parse positions ${err} ${record.positions}`);
    }
    return p;
  }, [
    record.destLat,
    record.destLng,
    record.lat,
    record.lng,
    record.positions,
  ]);

  return (
    <>
      {showMarkers &&
        positions.map((p, index) => (
          <Marker
            key={index}
            position={p}
            title={record.titleFn()}
            icon={record.icon()}
            draggable
            autoPan={false}
            eventHandlers={{
              dragend: (event) => {
                updateFirecallPositions(
                  firecallId,
                  (event.target as L.Marker)?.getLatLng(),
                  record.data(),
                  index
                );
              },
            }}
          >
            <Popup>
              <IconButton
                sx={{ marginLeft: 'auto', float: 'right' }}
                onClick={() => selectItem(record)}
              >
                <EditIcon />
              </IconButton>
              <IconButton
                sx={{ marginLeft: 'auto', float: 'right' }}
                onClick={() =>
                  deleteFirecallPosition(firecallId, record.data(), index)
                }
              >
                <DeleteIcon />
              </IconButton>
              {record.popupFn()}
            </Popup>
          </Marker>
        ))}
      <Polygon
        positions={positions}
        pathOptions={{
          color: record.color || '#0000ff',
          opacity: 0.8,
          fillOpacity: ((record as any)?.opacity || 50.0) / 100,
        }}
        eventHandlers={{
          popupopen: (event) => {
            setShowMarkers(true);
          },
          popupclose: (event) => {
            setShowMarkers(false);
          },
        }}
      >
        <Popup>
          <IconButton
            sx={{ marginLeft: 'auto', float: 'right' }}
            onClick={() => selectItem(record)}
          >
            <EditIcon />
          </IconButton>
          {record.popupFn()}
        </Popup>
      </Polygon>
    </>
  );
}
