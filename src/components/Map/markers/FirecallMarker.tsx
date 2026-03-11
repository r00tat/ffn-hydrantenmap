import { doc, setDoc } from 'firebase/firestore';
import L, { LeafletEventHandlerFnMap } from 'leaflet';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Marker, Popup, useMap } from 'react-leaflet';
import { defaultPosition } from '../../../hooks/constants';
import useFirecall from '../../../hooks/useFirecall';
import { useMapEditable } from '../../../hooks/useMapEditor';
import { firestore } from '../../firebase/firebase';
import { Firecall, FIRECALL_COLLECTION_ID } from '../../firebase/firestore';
import { PopupNavigateButton } from '../../FirecallItems/elements/FirecallItemBase';
import useFirebaseLogin from '../../../hooks/useFirebaseLogin';
import { logAuditChange } from '../../../hooks/useAuditLog';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import InfoIcon from '@mui/icons-material/Info';
import ListIcon from '@mui/icons-material/List';
import { useRouter } from 'next/navigation';

export const firecallIcon = L.icon({
  iconUrl: '/icons/fire.svg',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, 0],
});

export interface FirecallMarkerProps {
  firecall: Firecall;
}

export interface p extends LeafletEventHandlerFnMap {}

function onDragEnd(firecall: Firecall, event: L.DragEndEvent, email?: string) {
  const newPos = (event.target as L.Marker)?.getLatLng();
  if (newPos) {
    setDoc(
      doc(firestore, FIRECALL_COLLECTION_ID, firecall?.id || 'unknown'),
      {
        lat: newPos.lat,
        lng: newPos.lng,
      },
      {
        merge: true,
      }
    );

    if (email && firecall.id) {
      logAuditChange(firecall.id, email, {
        action: 'update',
        elementType: 'firecall',
        elementId: firecall.id,
        elementName: firecall.name || 'Einsatzort',
        previousValue: { lat: firecall.lat, lng: firecall.lng },
        newValue: { lat: newPos.lat, lng: newPos.lng },
      });
    }
  }
}

export default function FirecallMarker() {
  const map = useMap();
  const firecall = useFirecall();
  const editable = useMapEditable();
  const { email } = useFirebaseLogin();
  const router = useRouter();
  const markerRef = useRef<L.Marker>(null);

  const [contextMenuPos, setContextMenuPos] = useState<{
    top: number;
    left: number;
  }>();

  const closeContextMenu = useCallback(() => {
    setContextMenuPos(undefined);
  }, []);

  useEffect(() => {
    map.setView([
      firecall.lat || defaultPosition.lat,
      firecall.lng || defaultPosition.lng,
    ]);
  }, [firecall.lat, firecall.lng, map]);

  return (
    <>
      <Marker
        ref={markerRef}
        position={[
          firecall.lat || defaultPosition.lat,
          firecall.lng || defaultPosition.lng,
        ]}
        title="Einsatzort"
        icon={firecallIcon}
        draggable={editable}
        eventHandlers={{
          dragend: (event: L.DragEndEvent) => onDragEnd(firecall, event, email),
          contextmenu: (e: L.LeafletMouseEvent) => {
            e.originalEvent.preventDefault();
            setContextMenuPos({
              top: e.originalEvent.clientY,
              left: e.originalEvent.clientX,
            });
          },
        }}
      >
        <Popup>
          <PopupNavigateButton lat={firecall.lat} lng={firecall.lng} />
          Einsatzort {firecall.name}
        </Popup>
      </Marker>
      <Menu
        open={!!contextMenuPos}
        onClose={closeContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={contextMenuPos}
        slotProps={{ list: { dense: true } }}
      >
        <MenuItem onClick={() => {
          markerRef.current?.openPopup();
          closeContextMenu();
        }}>
          <ListItemIcon><InfoIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Details anzeigen</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => {
          router.push('/einsatzorte');
          closeContextMenu();
        }}>
          <ListItemIcon><ListIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Einsatzorte</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}
