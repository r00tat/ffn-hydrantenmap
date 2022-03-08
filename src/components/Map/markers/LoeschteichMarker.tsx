import L from 'leaflet';
import { ReactNode } from 'react';
import { Marker, Popup } from 'react-leaflet';
import { Loeschteich } from '../../../common/gis-objects';

export interface LoeschteichMarkerProps {
  objekt: Loeschteich;
  children?: ReactNode;
}

export const loeschteichIcon = L.icon({
  iconUrl: '/icons/loeschteich-icon.png',
  iconSize: [26, 31],
  iconAnchor: [13, 15],
  popupAnchor: [0, 0],
});

export default function LoeschteichMarker({
  objekt: o,
  children,
}: LoeschteichMarkerProps) {
  return (
    <Marker
      position={[o.lat, o.lng]}
      title={o.bezeichnung_adresse}
      key={o.id}
      icon={loeschteichIcon}
    >
      <Popup>
        <b>
          {o.ortschaft} {o.name}
        </b>
        <br />
        Zufluss: {o.zufluss_l_min_} l/min
        <br />
        Fassungsvermögen: {o.fassungsverm_gen_m3_}m3
      </Popup>
      {children}
    </Marker>
  );
}
