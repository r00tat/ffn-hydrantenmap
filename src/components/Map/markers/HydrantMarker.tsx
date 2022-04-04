import L from 'leaflet';
import { ReactNode } from 'react';
import { Marker, Popup } from 'react-leaflet';
import { HydrantenRecord } from '../../../common/gis-objects';

export interface HydrantenMarkerProps {
  hydrant: HydrantenRecord;
  children?: ReactNode;
}

export const hydrantIcon = L.icon({
  iconUrl: '/icons/hydrant.png',
  iconSize: [26, 31],
  iconAnchor: [13, 28],
  popupAnchor: [0, 0],
});
export const unterflurHydrantIcon = L.icon({
  iconUrl: '/icons/unterflur-hydrant-icon.png',
  iconSize: [26, 31],
  iconAnchor: [13, 28],
  popupAnchor: [0, 0],
});
export const fuellHydrantIcon = L.icon({
  iconUrl: '/icons/hydrant-icon-fuellen.png',
  iconSize: [26, 31],
  iconAnchor: [13, 28],
  popupAnchor: [0, 0],
});

const iconFn = (gisObj: HydrantenRecord) => {
  if (gisObj.typ !== 'Überflurhydrant') {
    return unterflurHydrantIcon;
  } else if (gisObj.fuellhydrant?.toLowerCase() === 'ja') {
    return fuellHydrantIcon;
  }

  return hydrantIcon;
};

export default function HydrantMarker({
  hydrant,
  children,
}: HydrantenMarkerProps) {
  return (
    <Marker
      position={[hydrant.lat, hydrant.lng]}
      title={hydrant.name}
      key={hydrant.name}
      icon={iconFn(hydrant)}
    >
      <Popup>
        <b>
          {hydrant.ortschaft} {hydrant.name}
          <br />
          {hydrant.leistung ? hydrant.leistung + ' l/min ' : ''} (
          {hydrant.dimension}mm)
        </b>
        <br />
        dynamisch: {hydrant.dynamischer_druck} bar
        <br />
        statisch: {hydrant.statischer_druck} bar
        {hydrant.fuellhydrant?.toLowerCase() === 'ja' ? (
          <>
            <br />
            Füllhydrant
          </>
        ) : (
          ''
        )}
      </Popup>
      {children}
    </Marker>
  );
}
