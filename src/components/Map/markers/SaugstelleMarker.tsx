import L from 'leaflet';
import { ReactNode } from 'react';
import { Marker, Popup } from 'react-leaflet';
import { Saugstelle } from '../../../common/gis-objects';

export interface SaugstelleMarkerProps {
  objekt: Saugstelle;
  children?: ReactNode;
}

export const saugstelleIcon = L.icon({
  iconUrl: '/icons/saugstelle-icon.png',
  iconSize: [26, 31],
  iconAnchor: [13, 15],
  popupAnchor: [0, 0],
});

export default function SaugstelleMarker({
  objekt: o,
  children,
}: SaugstelleMarkerProps) {
  return (
    <Marker
      position={[o.lat, o.lng]}
      title={o.bezeichnung_adresse}
      key={o.id}
      icon={saugstelleIcon}
    >
      <Popup>
        <b>
          {o.ortschaft} {o.name}
        </b>
        <br />
        {o.wasserentnahme_l_min_} l/min
        <br />
        Saughöhe: {o.geod_tische_saugh_he_m_}m $
        {o.saugleitungsl_nge_m_ && `${o.saugleitungsl_nge_m_}`.trim() && (
          <>
            <br />
            Länge Saugleitung: {o.saugleitungsl_nge_m_}
          </>
        )}
      </Popup>
      {children}
    </Marker>
  );
}
