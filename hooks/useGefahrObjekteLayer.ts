import L from 'leaflet';
import { GisWgsObject } from '../server/gis-objects';
import useFirestoreDataLayer from './useFirestoreDataLayer';

export default function useGefahrObjekteLayer(map: L.Map) {
  const layer = useFirestoreDataLayer(map, {
    collectionName: 'gefahrobjekt',
    icon: {
      iconUrl: '/icons/gefahr.svg',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, 0],
    },
    titleFn: (gisObj: GisWgsObject) => `${gisObj.ortschaft} ${gisObj.name}
    ${gisObj.adresse}`,
    popupFn: (
      gisObj: GisWgsObject
    ) => `<b>${gisObj.ortschaft} ${gisObj.name}</b><br>
    ${gisObj.adresse}`,
  });

  return layer;
}
