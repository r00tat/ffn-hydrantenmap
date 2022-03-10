import { doc, setDoc } from 'firebase/firestore';
import L, { IconOptions } from 'leaflet';
import { useState } from 'react';
import { Marker, Polyline, Popup } from 'react-leaflet';
import { defaultPosition } from '../../../hooks/constants';
import { useFirecallId } from '../../../hooks/useFirecall';
import { firestore } from '../../firebase/firebase';
import { Connection, FirecallItem } from '../../firebase/firestore';
import { firecallItemInfo } from '../../FirecallItems/firecallitems';

export interface FirecallItemMarkerProps {
  record: FirecallItem;
}

async function updateFircallItemPos(
  firecallId: string,
  event: L.DragEndEvent,
  fcItem: FirecallItem,
  dest = false
) {
  const newPos = (event.target as L.Marker)?.getLatLng();
  // console.info(`drag end on ${JSON.stringify(gisObject)}: ${newPos}`);
  if (fcItem.id && newPos) {
    const updatePos = dest
      ? {
          destLat: newPos.lat,
          destLng: newPos.lng,
        }
      : {
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
}: FirecallItemMarkerProps) {
  const itemInfo = firecallItemInfo(record.type);
  const icon = (
    typeof itemInfo.icon == 'function'
      ? (itemInfo.icon as Function)(record)
      : L.icon(itemInfo.icon as IconOptions)
  ) as L.Icon;
  const firecallId = useFirecallId();
  const [updatedPos, setUpdatedPos] = useState<L.LatLng>();
  const [updatedDestPos, setUpdatedDestPos] = useState<L.LatLng>();
  const startPos: L.LatLngExpression = updatedPos || [
    record.lat || defaultPosition.lat,
    record.lng || defaultPosition.lng,
  ];
  const destPos: L.LatLngExpression = updatedDestPos || [
    (record as Connection).destLat || defaultPosition.lat,
    (record as Connection).destLng || defaultPosition.lng,
  ];

  return (
    <>
      <Marker
        position={startPos}
        title={itemInfo.titleFn(record)}
        icon={icon}
        draggable
        autoPan={false}
        eventHandlers={{
          dragend: (event) => {
            setUpdatedPos((event.target as L.Marker)?.getLatLng());
            updateFircallItemPos(firecallId, event, record);
          },
        }}
      >
        <Popup>{itemInfo.popupFn(record)}</Popup>
      </Marker>
      {record.type === 'connection' && (
        <>
          <Marker
            position={destPos}
            title={itemInfo.titleFn(record)}
            icon={icon}
            draggable
            autoPan={false}
            eventHandlers={{
              dragend: (event) => {
                setUpdatedDestPos((event.target as L.Marker)?.getLatLng());
                updateFircallItemPos(firecallId, event, record, true);
              },
            }}
          >
            <Popup>{itemInfo.popupFn(record)}</Popup>
          </Marker>
          <Polyline
            positions={[startPos, destPos]}
            pathOptions={{ color: '#0000ff' }}
          ></Polyline>
        </>
      )}
    </>
  );
}
