import L from 'leaflet';
import { WgsObject } from '../common/gis-objects';
import useFirestoreDataLayer from './useFirestoreDataLayer';

export default function useRisikoObjekteLayer(map: L.Map) {
  const layer = useFirestoreDataLayer(map, {
    collectionName: 'risikoobjekt2',
    icon: {
      iconUrl: '/icons/risiko.svg',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, 0],
    },
    titleFn: (gisObj: WgsObject) => `${gisObj.ortschaft} ${gisObj.name}
    ${gisObj.risikogruppe}
    ${gisObj.adresse}`,
    popupFn: (
      gisObj: WgsObject
    ) => `<b>${gisObj.ortschaft} ${gisObj.name}</b><br>
    ${gisObj.risikogruppe}<br>
    ${gisObj.adresse}`,
  });

  return layer;
}
