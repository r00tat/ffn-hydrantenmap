import { FirecallItem } from '../../firebase/firestore';
import { fallbackIcon } from '../icons';
import { FirecallItemInfo } from './types';

export const fallbackInfo: FirecallItemInfo = {
  name: 'Firecallitem',
  title: (item) => `${item.name}`,
  info: (item) => '',
  body: (item) => `${item.beschreibung || ''}
  Position: ${item.lat},${item.lng}`,
  dialogText: (item) => item.name || '',
  fields: {
    name: 'Bezeichnung',
    beschreibung: 'Beschreibung',
  },
  dateFields: [],
  factory: () => ({
    type: 'fallback',
    name: '',
  }),
  popupFn: (gisObject: FirecallItem) => `${gisObject.name}`,
  titleFn: (gisObject: FirecallItem) => `${gisObject.name}`,
  icon: (gisObject: FirecallItem) => {
    return fallbackIcon;
  },
};
