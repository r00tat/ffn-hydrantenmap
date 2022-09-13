import L from 'leaflet';
import { ReactNode } from 'react';
import { createTimestamp } from '../../../common/time-format';
import { FirecallItem, Rohr } from '../../firebase/firestore';
import { FirecallItemInfo } from './types';
export const rohrItemInfo: FirecallItemInfo<Rohr> = {
  name: 'Rohr',
  title: (item) => `${item.art} Rohr ${item.name}`,
  info: (rohr) => `${rohr.durchfluss ? rohr.durchfluss + ' l/min' : ''}`,
  body: (rohr) => `Position: ${rohr.lat} ${rohr.lng}`,
  fields: {
    art: 'Art (C/B oder Wasserwerfer)',
    name: 'Bezeichnung',
    durchfluss: 'Durchfluss (l/min)',
  },
  dateFields: ['datum'],
  factory: () =>
    ({
      art: 'C',
      name: '',
      durchfluss: 100,
      type: 'rohr',
      datum: createTimestamp(),
    } as Rohr),
  dialogText: (item) => `C/B Rohr oder Wasserwerfer`,
  popupFn: (gisObject: FirecallItem) => {
    const rohr = gisObject as Rohr;
    return (
      <>
        <b>
          {rohr.name} {rohr.art} Rohr
        </b>
        {rohr.durchfluss && (
          <>
            <br />
            Durchfluss: {rohr.durchfluss} l/min
          </>
        )}
      </>
    );
  },
  titleFn: (v: FirecallItem) =>
    `${v.name} ${(v as Rohr).art || ''}${
      (v as Rohr).durchfluss ? ` ${(v as Rohr).durchfluss}l/min` : ''
    }`,
  icon: (gisObject: FirecallItem) => {
    const rohr = gisObject as Rohr;
    return L.icon({
      iconUrl: `/icons/rohr${
        ['b', 'c', 'ww', 'wasserwerfer'].indexOf(rohr.art.toLowerCase()) >= 0
          ? '-' + rohr.art.toLowerCase()
          : ''
      }.svg`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, 0],
    });
  },
};
