import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import L from 'leaflet';
import { useMemo, useState } from 'react';
import { Marker, Polyline, Popup } from 'react-leaflet';
import { LatLngPosition, latLngPosition } from '../../../../common/geo';
import { defaultPosition } from '../../../../hooks/constants';
import { useFirecallId } from '../../../../hooks/useFirecall';
import { Connection, FirecallItem } from '../../../firebase/firestore';
import { FirecallConnection } from '../FirecallConnection';
import {
  addFirecallPosition,
  deleteFirecallPosition,
  findSectionOnPolyline,
  updateFirecallPositions,
} from './positions';

export interface ConnectionMarkerProps {
  record: FirecallConnection;
  selectItem: (item: FirecallItem) => void;
}

export default function ConnectionMarker({
  record,
  selectItem,
}: ConnectionMarkerProps) {
  const firecallId = useFirecallId();
  const [point, setPoint] = useState(defaultPosition);
  const [pointIndex, setPointIndex] = useState(-1);
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
      {positions
        .filter(([pLat, pLng]) => pLat && pLng)
        .map(
          (p, index) =>
            (record.alwaysShowMarker === 'true' ||
              showMarkers ||
              index === 0 ||
              index === positions.length - 1) && (
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
                  <Tooltip title="Linie bearbeiten">
                    <IconButton
                      sx={{ marginLeft: 'auto', float: 'right' }}
                      onClick={() => selectItem(record)}
                    >
                      <EditIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Punkt entfernen">
                    <IconButton
                      sx={{ marginLeft: 'auto', float: 'right' }}
                      onClick={() =>
                        deleteFirecallPosition(
                          firecallId,
                          record as Connection,
                          index
                        )
                      }
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                  {record.popupFn()}
                  <br />
                  Punkt {index + 1} von {positions.length}
                </Popup>
              </Marker>
            )
        )}
      <Polyline
        positions={positions.filter(([pLat, pLng]) => pLat && pLng)}
        pathOptions={{
          color: record.color || '#0000ff',
          opacity: ((record as any)?.opacity || 100.0) / 100,
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
          {pointIndex >= 0 && (
            <Tooltip title="Einen Punkt hinzufügen">
              <IconButton
                color="primary"
                aria-label="add a point on the line"
                onClick={() =>
                  addFirecallPosition(
                    firecallId,
                    point,
                    record as Connection,
                    pointIndex
                  )
                }
              >
                <AddIcon />
              </IconButton>
            </Tooltip>
          )}
          <IconButton
            sx={{ marginLeft: 'auto', float: 'right' }}
            onClick={() => selectItem(record)}
          >
            <EditIcon />
          </IconButton>

          {record.popupFn()}
        </Popup>
      </Polyline>
    </>
  );
}
