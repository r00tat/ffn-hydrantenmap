import { FirecallItem } from '../../firebase/firestore';
import { asspIcon } from '../icons';
import { FirecallItemInfo } from './types';

export const asspInfo: FirecallItemInfo = {
  name: 'Atemschutzsammelplatz',
  title: (item) => `ASSP ${item.name || ''}`,
  info: (item) => ``,
  body: (item) => `${item.beschreibung || ''}
  Position: ${item.lat},${item.lng}`,
  fields: {
    name: 'Bezeichnung',
    beschreibung: 'Beschreibung',
  },
  dateFields: [],
  factory: () => ({
    type: 'assp',
    name: '',
    beschreibung: '',
  }),
  dialogText: (item) => `ASSP`,
  popupFn: (item: FirecallItem) => {
    return (
      <>
        <b>ASSP {item.name}</b>
        <br />
        {item.beschreibung || ''}
      </>
    );
  },
  titleFn: (item: FirecallItem) =>
    `ASSP ${item.name}\n${item.beschreibung || ''}`,
  icon: (gisObject: FirecallItem) => {
    return asspIcon;
  },
};
