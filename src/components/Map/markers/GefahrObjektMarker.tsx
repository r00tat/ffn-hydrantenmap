import L from 'leaflet';
import { ReactNode } from 'react';
import { Marker, Popup } from 'react-leaflet';
import { GefahrObjekt } from '../../../common/gis-objects';
import { PopupNavigateButton } from '../../FirecallItems/elements/FirecallItemBase';

export interface GefahrObjektMarkerProps {
  objekt: GefahrObjekt;
  children?: ReactNode;
}

export const gefahrObjektIcon = L.icon({
  iconUrl: '/icons/gefahr.svg',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, 0],
});

export default function GefahrObjektMarker({
  objekt: o,
  children,
}: GefahrObjektMarkerProps) {
  return (
    <Marker
      position={[o.lat, o.lng]}
      title={o.name}
      key={o.id}
      icon={gefahrObjektIcon}
    >
      <Popup>
        <PopupNavigateButton lat={o.lat} lng={o.lng} />
        <b>
          {o.ortschaft} {o.name}
        </b>
        <br />
        {o.adresse}
        {o.link && (
          <>
            <br />
            <a href={o.link} target="_blank" rel="noreferrer">
              Einsatzunterlagen
            </a>
          </>
        )}
      </Popup>
      {children}
    </Marker>
  );
}
