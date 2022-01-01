import { doc, setDoc } from 'firebase/firestore';
import L, { Map } from 'leaflet';
import { firestore } from '../components/firebase';
import { WgsObject } from '../server/gis-objects';
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

  const iconFn = (gisObj: WgsObject) => {
    return fzgIcon;
  };

  const firecallDataLayer = useFirestoreDataLayer(map, {
    collectionName: 'call',
    icon: iconFn,
    autoAdd: true,
    cluster: false,
    pathSegments: [firecall?.id || 'unkown', 'item'],
    popupFn: (gisObject: WgsObject) => {
      // console.info(`rendering popup for vehicle: ${JSON.stringify(gisObject)}`);
      return `${gisObject.name} ${gisObject.fw || ''}`;
    },

    markerOptions: {
      draggable: true,
    },
    events: {
      dragend: async (event: L.LeafletEvent, gisObject: WgsObject) => {
        const newPos = (event.target as L.Marker)?.getLatLng();
        // console.info(`drag end on ${JSON.stringify(gisObject)}: ${newPos}`);
        if (gisObject.id && newPos) {
          await setDoc(
            doc(
              firestore,
              'call',
              firecall?.id || 'unkown',
              'item',
              gisObject.id
            ),
            {
              lat: newPos.lat,
              lng: newPos.lng,
            },
            {
              merge: true,
            }
          );
        }
      },
    },
  });

  return firecallDataLayer;
}
