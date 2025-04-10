import { doc, setDoc } from 'firebase/firestore';
import L, { LeafletEventHandlerFnMap } from 'leaflet';
import { useEffect } from 'react';
import { Marker, Popup, useMap } from 'react-leaflet';
import { defaultPosition } from '../../../hooks/constants';
import useFirecall from '../../../hooks/useFirecall';
import { useMapEditable } from '../../../hooks/useMapEditor';
import { firestore } from '../../firebase/firebase';
import { Firecall, FIRECALL_COLLECTION_ID } from '../../firebase/firestore';

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

function onDragEnd(firecall: Firecall, event: L.DragEndEvent) {
  const newPos = (event.target as L.Marker)?.getLatLng();
  // console.info(`drag end on ${JSON.stringify(gisObject)}: ${newPos}`);
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
  }
}

export default function FirecallMarker() {
  const map = useMap();
  const firecall = useFirecall();
  const editable = useMapEditable();

  useEffect(() => {
    map.setView([
      firecall.lat || defaultPosition.lat,
      firecall.lng || defaultPosition.lng,
    ]);
  }, [firecall.lat, firecall.lng, map]);

  return (
    <Marker
      position={[
        firecall.lat || defaultPosition.lat,
        firecall.lng || defaultPosition.lng,
      ]}
      title="Einsatzort"
      icon={firecallIcon}
      draggable={editable}
      eventHandlers={{
        dragend: (event: L.DragEndEvent) => onDragEnd(firecall, event),
      }}
    >
      <Popup>Einsatzort {firecall.name}</Popup>
    </Marker>
  );
}
