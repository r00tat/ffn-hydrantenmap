import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { IconButton, Tooltip } from '@mui/material';
import { doc, setDoc } from 'firebase/firestore';
import L, { IconOptions } from 'leaflet';
import GeometryUtil from 'leaflet-geometryutil';
import { useMemo, useState } from 'react';
import { Marker, Polyline, Popup } from 'react-leaflet';
import { LatLngPosition, latLngPosition } from '../../../common/geo';
import { useFirecallId } from '../../../hooks/useFirecall';
import {
  calculateDistance,
  getConnectionPositions,
} from '../../FirecallItems/infos/connection';
import { firecallItemInfo } from '../../FirecallItems/infos/firecallitems';
import { firestore } from '../../firebase/firebase';
import { Connection, FirecallItem } from '../../firebase/firestore';
import { defaultPosition } from '../../../hooks/constants';

export async function updateFirecallPositions(
  firecallId: string,
  newPos: L.LatLng,
  fcItem: Connection,
  index: number
) {
  // console.info(`drag end on ${JSON.stringify(gisObject)}: ${newPos}`);
  if (fcItem.id && newPos && fcItem.positions) {
    const positions: LatLngPosition[] = getConnectionPositions(fcItem);
    positions.splice(index, 1, [newPos.lat, newPos.lng]);
    await updateConnectionInFirestore(firecallId, fcItem, positions);
  }
}
export async function addFirecallPosition(
  firecallId: string,
  newPos: L.LatLng,
  fcItem: Connection,
  index: number
) {
  // console.info(`drag end on ${JSON.stringify(gisObject)}: ${newPos}`);
  if (fcItem.id && newPos && fcItem.positions) {
    const positions: LatLngPosition[] = getConnectionPositions(fcItem);
    positions.splice(index, 0, [newPos.lat, newPos.lng]);
    await updateConnectionInFirestore(firecallId, fcItem, positions);
  }
}

export async function deleteFirecallPosition(
  firecallId: string,
  fcItem: Connection,
  index: number
) {
  // console.info(`drag end on ${JSON.stringify(gisObject)}: ${newPos}`);
  if (fcItem.id && fcItem.positions) {
    const positions: LatLngPosition[] = getConnectionPositions(fcItem);
    positions.splice(index, 1);
    await updateConnectionInFirestore(firecallId, fcItem, positions);
  }
}

export function findSectionOnPolyline(
  positions: LatLngPosition[],
  point: L.LatLng
) {
  for (let i = 1; i < positions.length; i++) {
    const belongsToSection = GeometryUtil.belongsSegment(
      point,
      new L.LatLng(positions[i - 1][0], positions[i - 1][1]),
      new L.LatLng(positions[i][0], positions[i][1])
    );
    if (belongsToSection) {
      console.info(
        `click point ${point} belongs to section ${positions[i - 1]}-${
          positions[i]
        } ${i - 1}-${i}`
      );
      return i;
    }
  }

  return -1;
}

const updateConnectionInFirestore = async (
  firecallId: string,
  fcItem: Connection,
  positions: LatLngPosition[]
) => {
  if (fcItem.id)
    return await setDoc(
      doc(firestore, 'call', firecallId, 'item', fcItem.id),
      {
        positions: JSON.stringify(positions),
        distance: Math.round(calculateDistance(positions)),
      },
      {
        merge: true,
      }
    );
};

export interface ConnectionMarkerProps {
  record: Connection;
  selectItem: (item: FirecallItem) => void;
}

export default function ConnectionMarker({
  record,
  selectItem,
}: ConnectionMarkerProps) {
  const itemInfo = firecallItemInfo(record.type);
  const icon = (
    typeof itemInfo.icon == 'function'
      ? (itemInfo.icon as Function)(record)
      : L.icon(itemInfo.icon as IconOptions)
  ) as L.Icon;
  const firecallId = useFirecallId();
  const [point, setPoint] = useState(defaultPosition);
  const [pointIndex, setPointIndex] = useState(-1);

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
      {positions.map((p, index) => (
        <Marker
          key={index}
          position={p}
          title={itemInfo.titleFn(record)}
          icon={icon}
          draggable
          autoPan={false}
          eventHandlers={{
            dragend: (event) => {
              updateFirecallPositions(
                firecallId,
                (event.target as L.Marker)?.getLatLng(),
                record,
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
                  deleteFirecallPosition(firecallId, record, index)
                }
              >
                <DeleteIcon />
              </IconButton>
            </Tooltip>
            {itemInfo.popupFn(record)}
            <br />
            Punkt {index} von {positions.length}
          </Popup>
        </Marker>
      ))}
      <Polyline
        positions={positions}
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
        }}
      >
        <Popup>
          {pointIndex >= 0 && (
            <Tooltip title="Einen Punkt hinzufügen">
              <IconButton
                color="primary"
                aria-label="add a point on the line"
                onClick={() =>
                  addFirecallPosition(firecallId, point, record, pointIndex)
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

          {itemInfo.popupFn(record)}
        </Popup>
      </Polyline>
    </>
  );
}
