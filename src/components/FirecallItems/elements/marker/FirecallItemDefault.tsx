import { doc, setDoc } from 'firebase/firestore';
import L from 'leaflet';
import { useEffect, useState } from 'react';
import { defaultPosition } from '../../../../hooks/constants';
import { useFirecallId } from '../../../../hooks/useFirecall';
import useFirebaseLogin from '../../../../hooks/useFirebaseLogin';
import useMapEditor from '../../../../hooks/useMapEditor';
import { RotatedMarker } from '../../../Map/markers/RotatedMarker';
import { firestore } from '../../../firebase/firebase';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  FirecallItem,
} from '../../../firebase/firestore';
import { logAuditChange } from '../../../../hooks/useAuditLog';
import { FirecallItemBase } from '../FirecallItemBase';

export interface MarkerRenderOptions {
  /* do not show the popup */
  hidePopup?: boolean;
  /* disable click handler (used for preview markers during placement) */
  disableClick?: boolean;
}

export interface FirecallItemMarkerProps {
  record: FirecallItemBase;
  selectItem: (item: FirecallItem) => void;
  options?: MarkerRenderOptions;
  children?: React.ReactNode;
}

async function updateFircallItemPos(
  firecallId: string,
  event: L.DragEndEvent,
  fcItem: FirecallItem,
  email?: string
) {
  const newPos = (event.target as L.Marker)?.getLatLng();
  if (fcItem.id && newPos) {
    const updatePos = {
      lat: newPos.lat,
      lng: newPos.lng,
    };

    await setDoc(
      doc(
        firestore,
        FIRECALL_COLLECTION_ID,
        firecallId,
        FIRECALL_ITEMS_COLLECTION_ID,
        fcItem.id
      ),
      updatePos,
      {
        merge: true,
      }
    );

    if (email) {
      logAuditChange(firecallId, email, {
        action: 'update',
        elementType: fcItem.type,
        elementId: fcItem.id,
        elementName: fcItem.name || '',
        previousValue: { lat: fcItem.lat, lng: fcItem.lng },
        newValue: updatePos,
      });
    }
  }
}

export function FirecallItemMarkerDefault({
  record,
  selectItem,
  options: { hidePopup, disableClick } = {},
  children,
}: FirecallItemMarkerProps) {
  const icon = record.icon();
  const firecallId = useFirecallId();
  const { email } = useFirebaseLogin();
  const [startPos, setStartPos] = useState<L.LatLng>(
    L.latLng(
      record.lat || defaultPosition.lat,
      record.lng || defaultPosition.lng
    )
  );
  const { editable, selectFirecallItem } = useMapEditor();

  useEffect(() => {
    if (record.lat && record.lng) {
      (async () => {
        setStartPos(L.latLng(record.lat, record.lng));
      })();
    }
  }, [record.lat, record.lng]);

  return (
    <>
      <RotatedMarker
        position={startPos}
        title={record.titleFn()}
        icon={icon}
        draggable={editable && record.draggable}
        autoPan={false}
        eventHandlers={{
          ...record.eventHandlers,
          dragend: (event) => {
            setStartPos((event.target as L.Marker)?.getLatLng());
            updateFircallItemPos(firecallId, event, record, email);
          },
          ...(disableClick
            ? {}
            : {
                click: () => {
                  selectFirecallItem(record);
                },
              }),
        }}
        rotationAngle={
          record?.rotation &&
          !Number.isNaN(Number.parseInt(record?.rotation, 10))
            ? Number.parseInt(record?.rotation, 10) % 360
            : 0
        }
        rotationOrigin="center"
      >
        {!hidePopup && record.renderPopup(selectItem)}
        {children}
      </RotatedMarker>
    </>
  );
}
