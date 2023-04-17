import EditIcon from '@mui/icons-material/Edit';
import { IconButton } from '@mui/material';
import { doc, setDoc } from 'firebase/firestore';
import L, { IconOptions } from 'leaflet';
import { useEffect, useState } from 'react';
import { Marker, Popup } from 'react-leaflet';
import { defaultPosition } from '../../../hooks/constants';
import { useFirecallId } from '../../../hooks/useFirecall';
import { firestore } from '../../firebase/firebase';
import { Connection, FirecallItem } from '../../firebase/firestore';
import { firecallItemInfo } from '../../FirecallItems/infos/firecallitems';
import ConnectionMarker from './ConnectionMarker';
import { RotatedMarker } from './RotatedMarker';

export interface FirecallItemMarkerProps {
  record: FirecallItem;
  selectItem: (item: FirecallItem) => void;
}

async function updateFircallItemPos(
  firecallId: string,
  event: L.DragEndEvent,
  fcItem: FirecallItem
) {
  const newPos = (event.target as L.Marker)?.getLatLng();
  // console.info(`drag end on ${JSON.stringify(fcItem)}: ${newPos}`);
  if (fcItem.id && newPos) {
    const updatePos = {
      lat: newPos.lat,
      lng: newPos.lng,
    };

    await setDoc(
      doc(firestore, 'call', firecallId, 'item', fcItem.id),
      updatePos,
      {
        merge: true,
      }
    );
  }
}

export default function FirecallItemMarker({
  record,
  selectItem,
}: FirecallItemMarkerProps) {
  return record.type === 'connection' ? (
    <ConnectionMarker record={record as Connection} selectItem={selectItem} />
  ) : (
    <FirecallItemMarkerDefault record={record} selectItem={selectItem} />
  );
}

export function FirecallItemMarkerDefault({
  record,
  selectItem,
}: FirecallItemMarkerProps) {
  const itemInfo = firecallItemInfo(record.type);
  const icon = (
    typeof itemInfo.icon == 'function'
      ? (itemInfo.icon as Function)(record)
      : L.icon(itemInfo.icon as IconOptions)
  ) as L.Icon;
  const firecallId = useFirecallId();
  const [startPos, setStartPos] = useState<L.LatLng>(
    L.latLng(
      record.lat || defaultPosition.lat,
      record.lng || defaultPosition.lng
    )
  );

  useEffect(() => {
    if (record.lat && record.lng) {
      setStartPos(L.latLng(record.lat, record.lng));
    }
  }, [record.lat, record.lng]);

  return (
    <>
      <RotatedMarker
        position={startPos}
        title={itemInfo.titleFn(record)}
        icon={icon}
        draggable
        autoPan={false}
        eventHandlers={{
          dragend: (event) => {
            setStartPos((event.target as L.Marker)?.getLatLng());
            updateFircallItemPos(firecallId, event, record);
          },
        }}
        rotationAngle={
          record?.rotation &&
          !Number.isNaN(Number.parseInt(record?.rotation, 10))
            ? Number.parseInt(record?.rotation, 10) % 360
            : 0
        }
        rotationOrigin="center"
      >
        <Popup>
          <IconButton
            sx={{ marginLeft: 'auto', float: 'right' }}
            onClick={() => selectItem(record)}
          >
            <EditIcon />
          </IconButton>
          {itemInfo.popupFn(record)}
        </Popup>
      </RotatedMarker>
    </>
  );
}
