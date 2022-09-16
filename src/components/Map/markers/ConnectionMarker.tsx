import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { IconButton } from '@mui/material';
import { doc, setDoc } from 'firebase/firestore';
import L, { IconOptions } from 'leaflet';
import { useMemo } from 'react';
import { Marker, Polyline, Popup } from 'react-leaflet';
import { latLngPosition, LatLngPosition } from '../../../common/geo';
import { useFirecallId } from '../../../hooks/useFirecall';
import { firestore } from '../../firebase/firebase';
import { Connection, FirecallItem } from '../../firebase/firestore';
import {
  calculateDistance,
  connectionInfo,
  getConnectionPositions,
} from '../../FirecallItems/infos/connection';
import { firecallItemInfo } from '../../FirecallItems/infos/firecallitems';

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
            <IconButton
              sx={{ marginLeft: 'auto', float: 'right' }}
              onClick={() => selectItem(record)}
            >
              <EditIcon />
            </IconButton>
            <IconButton
              sx={{ marginLeft: 'auto', float: 'right' }}
              onClick={() => deleteFirecallPosition(firecallId, record, index)}
            >
              <DeleteIcon />
            </IconButton>
            {connectionInfo.popupFn(record)}
          </Popup>
        </Marker>
      ))}
      <Polyline
        positions={positions}
        pathOptions={{ color: record.color || '#0000ff' }}
      ></Polyline>
    </>
  );
}
