import L from 'leaflet';
import { WgsObject } from '../common/gis-objects';
import useFirestoreDataLayer from './useFirestoreDataLayer';

export default function useLoeschteicheLayer(map: L.Map) {
  const layer = useFirestoreDataLayer(map, {
    collectionName: 'loeschteich',
    icon: {
      iconUrl: '/icons/loeschteich-icon.png',
      iconSize: [26, 31],
      iconAnchor: [13, 15],
      popupAnchor: [0, 0],
    },
    titleFn: (gisObj: WgsObject) => `${gisObj.ortschaft} ${gisObj.name}
    Zufluss: ${gisObj.zufluss_l_min_} l/min
    Fassungsvermögen: ${gisObj.fassungsverm_gen_m3_}m3`,
    popupFn: (
      gisObj: WgsObject
    ) => `<b>${gisObj.ortschaft} ${gisObj.name}</b><br>
    Zufluss: ${gisObj.zufluss_l_min_} l/min<br>
    Fassungsvermögen: ${gisObj.fassungsverm_gen_m3_}m3`,
  });

  return layer;
}
