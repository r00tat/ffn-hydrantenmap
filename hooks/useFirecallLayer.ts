import L, { Map } from 'leaflet';
import { GisWgsObject } from '../server/gis-objects';
import useFirecall from './useFirecall';
import useFirestoreDataLayer from './useFirestoreDataLayer';

export function useFirecallLayer(map: Map) {
  const firecall = useFirecall();

  const fzgIcon = L.icon({
    iconUrl: '/icons/fzg.svg',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, 0],
  });

  const iconFn = (gisObj: GisWgsObject) => {
    return fzgIcon;
  };

  const firecallDataLayer = useFirestoreDataLayer(map, {
    collectionName: 'call',
    icon: iconFn,
    autoAdd: true,
    cluster: false,
    pathSegments: [firecall?.id || 'unkown', 'item'],
    popupFn: (gisObject: GisWgsObject) => {
      console.info(`rendering popup for vehicle: ${JSON.stringify(gisObject)}`);
      return `${gisObject.name} ${gisObject.fw}`;
    },

    markerOptions: {
      draggable: true,
    },
  });

  return firecallDataLayer;
}
