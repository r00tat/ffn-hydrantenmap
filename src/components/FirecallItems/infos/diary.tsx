import moment from 'moment';
import { Diary, FirecallItem } from '../../firebase/firestore';
import { markerIcon } from '../icons';
import { FirecallItemInfo } from './types';

export const diaryItemInfo: FirecallItemInfo<Diary> = {
  name: 'Einsatztagebuch',
  title: (item) => `${item.name || ''}`,
  info: (item) =>
    `${item.datum} ${item.von || item.an ? `${item.von} => ${item.an}` : ''}`,
  body: (item) => `${item.beschreibung || ''}`,
  fields: {
    name: 'Bezeichnung',
    beschreibung: 'Beschreibung',
    von: 'Von',
    an: 'An',
    datum: 'Zeitstempel',
    erledigt: 'erledigt',
  },
  dateFields: ['datum', 'erledigt'],
  factory: () => ({
    type: 'diary',
    name: '',
    beschreibung: '',
    von: '',
    an: '',
    datum: moment().toISOString(),
    erledigt: '',
  }),
  dialogText: (item) => `Eintrag ${item.name || ''}`,
  popupFn: (item: FirecallItem) => {
    return (
      <>
        <b>Eintrag {item.name}</b>
        <br />
        {item.beschreibung || ''}
      </>
    );
  },
  titleFn: (item: FirecallItem) =>
    `Eintrag ${item.name}\n${item.beschreibung || ''}`,
  icon: (gisObject: FirecallItem) => {
    return markerIcon;
  },
};
