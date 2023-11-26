import { doc, setDoc } from 'firebase/firestore';
import L from 'leaflet';
import { useEffect, useState } from 'react';
import { defaultPosition } from '../../../hooks/constants';
import { useFirecallId } from '../../../hooks/useFirecall';
import { RotatedMarker } from '../../Map/markers/RotatedMarker';
import { firestore } from '../../firebase/firebase';
import { FirecallItem } from '../../firebase/firestore';
import { FirecallItemBase } from './FirecallItemBase';

export interface FirecallItemMarkerProps {
  record: FirecallItemBase;
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

export function FirecallItemMarkerDefault({
  record,
  selectItem,
}: FirecallItemMarkerProps) {
  const icon = record.icon();
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
        title={record.titleFn()}
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
        {record.renderPopup(selectItem)}
      </RotatedMarker>
    </>
  );
}
