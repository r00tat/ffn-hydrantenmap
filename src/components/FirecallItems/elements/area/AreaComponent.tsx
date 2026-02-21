'use client';

import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import L from 'leaflet';
import { useMemo, useState } from 'react';
import { Marker, Polygon, Popup } from 'react-leaflet';
import { LatLngPosition, latLngPosition } from '../../../../common/geo';
import { defaultPosition } from '../../../../hooks/constants';
import { useFirecallId } from '../../../../hooks/useFirecall';
import useFirebaseLogin from '../../../../hooks/useFirebaseLogin';
import { useMapEditable } from '../../../../hooks/useMapEditor';
import { FirecallItem } from '../../../firebase/firestore';
import { PopupNavigateButton } from '../FirecallItemBase';
import { FirecallArea } from '../FirecallArea';
import {
  addFirecallPosition,
  deleteFirecallPosition,
  findSectionOnPolyline,
  updateFirecallPositions,
} from '../connection/positions';

export interface AreaMarkerProps {
  record: FirecallArea;
  selectItem: (item: FirecallItem) => void;
}

export default function AreaMarker({ record, selectItem }: AreaMarkerProps) {
  const firecallId = useFirecallId();
  const { email } = useFirebaseLogin();
  const [showMarkers, setShowMarkers] = useState(false);
  const [point, setPoint] = useState(defaultPosition);
  const [pointIndex, setPointIndex] = useState(-1);
  const editable = useMapEditable();

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
      {(record.alwaysShowMarker === 'true' || showMarkers) &&
        positions.map((p, index) => (
          <Marker
            key={index}
            position={p}
            title={record.titleFn()}
            icon={record.icon()}
            draggable={editable}
            autoPan={false}
            eventHandlers={{
              dragend: (event) => {
                updateFirecallPositions(
                  firecallId,
                  (event.target as L.Marker)?.getLatLng(),
                  record.data(),
                  index,
                  email
                );
              },
            }}
          >
            <Popup>
              <PopupNavigateButton lat={p[0]} lng={p[1]} />
              {editable && (
                <>
                  <IconButton
                    sx={{ marginLeft: 'auto', float: 'right' }}
                    onClick={() => selectItem(record)}
                  >
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    sx={{ marginLeft: 'auto', float: 'right' }}
                    onClick={() =>
                      deleteFirecallPosition(firecallId, record.data(), index, email)
                    }
                  >
                    <DeleteIcon />
                  </IconButton>
                </>
              )}
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
          click: (event) => {
            const index = findSectionOnPolyline(positions, event.latlng);
            // console.info(
            //   `clicked on polyline ${event.latlng} index in points: ${index}`
            // );
            setPoint(event.latlng);
            setPointIndex(index);
          },
          // mouseover: () => setShowMarkers(true),
          // mouseout: () => setShowMarkers(false),
          popupopen: () => setShowMarkers(true),
          popupclose: () => setShowMarkers(false),
        }}
      >
        <Popup>
          <PopupNavigateButton lat={record.lat} lng={record.lng} />
          {editable && pointIndex >= 0 && (
            <Tooltip title="Einen Punkt hinzufügen">
              <IconButton
                color="primary"
                aria-label="add a point on the line"
                onClick={() =>
                  addFirecallPosition(firecallId, point, record, pointIndex, email)
                }
              >
                <AddIcon />
              </IconButton>
            </Tooltip>
          )}
          {editable && (
            <IconButton
              sx={{ marginLeft: 'auto', float: 'right' }}
              onClick={() => selectItem(record)}
            >
              <EditIcon />
            </IconButton>
          )}
          {record.popupFn()}
        </Popup>
      </Polygon>
    </>
  );
}
