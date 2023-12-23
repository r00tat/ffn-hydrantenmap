import { FirecallItem, FcMarker } from '../../firebase/firestore';
import { markerIcon } from '../icons';
import { FirecallItemInfo } from './types';
import L from 'leaflet';

export const markerInfo: FirecallItemInfo<FcMarker> = {
  name: 'Marker',
  title: (item) => `${item.name || ''}`,
  info: (item) => ``,
  body: (item) => `${item.beschreibung || ''}
  Position: ${item.lat},${item.lng}`,
  fields: {
    name: 'Bezeichnung',
    beschreibung: 'Beschreibung',
    icon: 'Icon URL',
  },
  dateFields: [],
  factory: () => ({
    type: 'marker',
    name: '',
    beschreibung: '',
    datum: new Date().toISOString(),
  }),
  // fieldTypes: { beschreibung: 'multiline' },
  dialogText: (item) => `Markierung`,
  popupFn: (item: FirecallItem) => {
    return (
      <>
        <b>{item.name}</b>
        <br />
        {item.beschreibung || ''}
      </>
    );
  },
  titleFn: (item: FirecallItem) => `${item.name}\n${item.beschreibung || ''}`,
  icon: (m: FirecallItem) => {
    if ((m as any)?.icon) {
      return L.icon({
        iconUrl: (m as any)?.icon,
        iconSize: [24, 24],
      });
    }
    return markerIcon;
  },
};
