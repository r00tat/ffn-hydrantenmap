import { doc, setDoc } from 'firebase/firestore';
import L, { Map } from 'leaflet';
import { useCallback, useEffect, useState } from 'react';
import { firestore } from '../components/firebase';
import { filterActiveItems, FirecallItem, Fzg } from '../components/firestore';
import useFirecall from './useFirecall';
import useFirestoreDataLayer from './useFirestoreDataLayer';

export function useFirecallLayer(map: Map) {
  const firecall = useFirecall();
  const [additionalLayers, setAdditionalLayers] = useState<L.Layer[]>([]);

  const iconFn = useCallback((gisObj: FirecallItem) => {
    if (gisObj.type === 'vehicle') {
      return L.icon({
        iconUrl: `/api/fzg?name=${encodeURIComponent(
          gisObj?.name || ''
        )}&fw=${encodeURIComponent((gisObj as Fzg)?.fw || '')}`,
        iconSize: [45, 20],
        iconAnchor: [20, 0],
        popupAnchor: [0, 0],
      });
    }
    return L.icon({
      iconUrl: `/icons/fzg.svg`,
      iconSize: [45, 20],
      iconAnchor: [20, 0],
      popupAnchor: [0, 0],
    });
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
    popupFn: (gisObject: FirecallItem) => {
      // console.info(`rendering popup for vehicle: ${JSON.stringify(gisObject)}`);

      if (gisObject.type === 'vehicle') {
        const v = gisObject as Fzg;
        return `${v.name} ${v.fw || ''}${
          v.besatzung ? '<br />Besatzung: 1:' + v.besatzung : ''
        } ${v.ats ? `${v.ats} ATS` : ''}
      ${v.alarmierung ? '<br>Alarmierung: ' + v.alarmierung : ''}
      ${v.eintreffen ? '<br>Eintreffen: ' + v.eintreffen : ''}
      ${v.abruecken ? '<br>Abrücken: ' + v.abruecken : ''}
      `;
      }

      return gisObject.name || '';
    },

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
