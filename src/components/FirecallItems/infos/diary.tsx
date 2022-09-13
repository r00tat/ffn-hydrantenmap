import L from 'leaflet';
import { ReactNode } from 'react';
import { createTimestamp } from '../../../common/time-format';
import { toLatLng } from '../../../hooks/constants';
import { mapPosition } from '../../../hooks/useMapPosition';
import {
  Connection,
  Diary,
  FirecallItem,
  Fzg,
  Rohr,
} from '../../firebase/firestore';
import {
  asspIcon,
  connectionIcon,
  elIcon,
  fallbackIcon,
  markerIcon,
} from '../icons';
import { rohrItemInfo } from './rohr';
import { FirecallItemInfo, FirecallItemInfoList } from './types';
import { vehicleItemInfo } from './vehicle';

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
  dateFields: ['datum'],
  factory: () => ({
    type: 'diary',
    name: '',
    beschreibung: '',
    von: '',
    an: '',
    datum: createTimestamp(),
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
