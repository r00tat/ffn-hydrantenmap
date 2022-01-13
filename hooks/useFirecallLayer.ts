import { doc, setDoc } from 'firebase/firestore';
import L, { Map } from 'leaflet';
import { useCallback, useEffect, useState } from 'react';
import { firestore } from '../components/firebase';
import { firecallItemInfo } from '../components/firecallitems';
import { filterActiveItems, FirecallItem } from '../components/firestore';
import useFirecall from './useFirecall';
import useFirestoreDataLayer from './useFirestoreDataLayer';

export function useFirecallLayer(map: Map) {
  const firecall = useFirecall();
  const [additionalLayers, setAdditionalLayers] = useState<L.Layer[]>([]);

  const iconFn = useCallback((gisObj: FirecallItem) => {
    const icon = firecallItemInfo(gisObj?.type).icon;
    if (typeof icon === 'function') {
      return icon(gisObj);
    } else {
      return L.icon(icon);
    }
  }, []);

  useEffect(() => {
    if (firecall.lat && firecall.lng) {
      setAdditionalLayers([
        L.marker([firecall.lat, firecall.lng], {
          icon: L.icon({
            iconUrl: '/icons/fire.svg',
            iconSize: [24, 24],
            iconAnchor: [12, 12],
            popupAnchor: [0, 0],
          }),
          draggable: true,
        })
          .bindTooltip('Einsatzort')
          .bindPopup('Einsatzort')
          .on('dragend', (event: L.LeafletEvent) => {
            const newPos = (event.target as L.Marker)?.getLatLng();
            // console.info(`drag end on ${JSON.stringify(gisObject)}: ${newPos}`);
            if (newPos) {
              setDoc(
                doc(firestore, 'call', firecall?.id || 'unkown'),
                {
                  lat: newPos.lat,
                  lng: newPos.lng,
                },
                {
                  merge: true,
                }
              );
            }
          }),
      ]);
    }
    return () => {};
  }, [firecall?.id, firecall?.lat, firecall?.lng]);

  const firecallDataLayer = useFirestoreDataLayer<FirecallItem>(map, {
    collectionName: 'call',
    icon: iconFn,
    autoAdd: true,
    cluster: false,
    pathSegments: [firecall?.id || 'unkown', 'item'],
    filterFn: filterActiveItems,
    popupFn: (gisObject: FirecallItem) =>
      firecallItemInfo(gisObject?.type).popupFn(gisObject),
    titleFn: (gisObject: FirecallItem) =>
      firecallItemInfo(gisObject?.type).titleFn(gisObject),
    markerOptions: {
      draggable: true,
    },
    additionalLayers,
    events: {
      dragend: async (event: L.LeafletEvent, gisObject: FirecallItem) => {
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
