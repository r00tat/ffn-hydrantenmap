import L from 'leaflet';
import { ReactNode } from 'react';
import { Marker, Popup } from 'react-leaflet';
import { HydrantenRecord } from '../../../common/gis-objects';
import useMapEditor from '../../../hooks/useMapEditor';
import { HydrantenItem } from '../../firebase/firestore';

export interface HydrantenMarkerProps {
  hydrant: HydrantenRecord;
  children?: ReactNode;
}

export const hydrantIcon = L.icon({
  iconUrl: '/icons/hydrant.png',
  iconSize: [26, 31],
  iconAnchor: [13, 28],
  popupAnchor: [1, -22],
});
export const unterflurHydrantIcon = L.icon({
  iconUrl: '/icons/unterflur-hydrant-icon.png',
  iconSize: [26, 31],
  iconAnchor: [13, 28],
  popupAnchor: [1, -22],
});
export const fuellHydrantIcon = L.icon({
  iconUrl: '/icons/hydrant-icon-fuellen.png',
  iconSize: [26, 31],
  iconAnchor: [13, 28],
  popupAnchor: [1, -22],
});

export const hydrantIconFn = (gisObj: HydrantenRecord) => {
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
  const { selectFirecallItem } = useMapEditor();
  return (
    <Marker
      position={[hydrant.lat, hydrant.lng]}
      title={hydrant.name}
      key={hydrant.name}
      icon={hydrantIconFn(hydrant)}
      eventHandlers={{
        click: () => {
          selectFirecallItem({
            ...hydrant,
            editable: false,
            type: 'hydrant',
          } as unknown as HydrantenItem);
        },
      }}
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
        {hydrant.fuellhydrant?.toLowerCase() === 'ja' && (
          <>
            <br />
            Füllhydrant
          </>
        )}
        {hydrant.leitungsart && (
          <>
            <br />
            {hydrant.leitungsart}
          </>
        )}
      </Popup>
      {children}
    </Marker>
  );
}
