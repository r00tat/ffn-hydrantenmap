import L from 'leaflet';
import { ReactNode } from 'react';
import { Marker, Popup } from 'react-leaflet';
import { RisikoObjekt } from '../../../common/gis-objects';
import { PopupNavigateButton } from '../../FirecallItems/elements/FirecallItemBase';

export interface RisikoObjektMarkerProps {
  risikoobjekt: RisikoObjekt;
  children?: ReactNode;
}

export const risikoObjektIcon = L.icon({
  iconUrl: '/icons/risiko.svg',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, 0],
});

export default function RisikoObjektMarker({
  risikoobjekt: r,
  children,
}: RisikoObjektMarkerProps) {
  return (
    <Marker
      position={[r.lat, r.lng]}
      title={r.name}
      key={r.id}
      icon={risikoObjektIcon}
    >
      <Popup>
        <PopupNavigateButton lat={r.lat} lng={r.lng} />
        <b>
          {r.ortschaft} {r.name}
        </b>
        <br />
        {r.risikogruppe}
        <br />
        {r.adresse}
        {r.link && (
          <>
            <br />
            <a href={r.link} target="_blank" rel="noreferrer">
              Einsatzunterlagen
            </a>
          </>
        )}
      </Popup>
      {children}
    </Marker>
  );
}
