import { FirecallItem, FirecallItemMarker } from '../../firebase/firestore';
import { markerIcon } from '../icons';
import { FirecallItemInfo } from './types';

export const markerInfo: FirecallItemInfo<FirecallItemMarker> = {
  name: 'Marker',
  title: (item) => `${item.name || ''}`,
  info: (item) => ``,
  body: (item) => `${item.beschreibung || ''}
  Position: ${item.lat},${item.lng}`,
  fields: {
    name: 'Bezeichnung',
    beschreibung: 'Beschreibung',
  },
  dateFields: [],
  factory: () => ({
    type: 'marker',
    name: '',
    beschreibung: '',
    datum: '',
  }),
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
  icon: (gisObject: FirecallItem) => {
    return markerIcon;
  },
};
