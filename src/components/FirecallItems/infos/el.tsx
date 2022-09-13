import { FirecallItem } from '../../firebase/firestore';
import { elIcon } from '../icons';
import { FirecallItemInfo } from './types';

export const elInfo: FirecallItemInfo = {
  name: 'Einsatzleitung',
  title: (item) => `Einsatzleitung ${item.name || ''}`,
  info: (item) => ``,
  body: (item) => `${item.beschreibung || ''}
  Position: ${item.lat},${item.lng}`,
  fields: {
    name: 'Bezeichnung',
    beschreibung: 'Beschreibung',
  },
  dateFields: [],
  factory: () => ({
    type: 'el',
    name: '',
    beschreibung: '',
  }),
  dialogText: (item) => `Einsatzleitung`,
  popupFn: (item: FirecallItem) => {
    return (
      <>
        <b>Einsatzleitung {item.name}</b>
        <br />
        {item.beschreibung || ''}
      </>
    );
  },
  titleFn: (item: FirecallItem) =>
    `ELung ${item.name}\n${item.beschreibung || ''}`,
  icon: (gisObject: FirecallItem) => {
    return elIcon;
  },
};
