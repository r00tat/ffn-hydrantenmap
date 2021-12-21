import L from 'leaflet';
import { GisWgsObject } from '../server/gis-objects';
import useFirestoreDataLayer from './useFirestoreDataLayer';

export default function useSaugstellenLayer(map: L.Map) {
  const layer = useFirestoreDataLayer(map, {
    collectionName: 'saugstelle',
    icon: {
      iconUrl: '/icons/saugstelle-icon.png',
      iconSize: [26, 31],
      iconAnchor: [13, 15],
      popupAnchor: [0, 0],
    },
    titleFn: (gisObj: GisWgsObject) => `${gisObj.ortschaft} ${gisObj.name}
    ${gisObj.wasserentnahme_l_min_} l/min
    Saughöhe: ${gisObj.geod_tische_saugh_he_m_}m
    ${
      gisObj.saugleitungsl_nge_m_ &&
      `${gisObj.saugleitungsl_nge_m_}`.trim() !== ''
        ? `Länge Saugleitung: ${gisObj.saugleitungsl_nge_m_}`
        : ''
    }`,
    popupFn: (gisObj: GisWgsObject) => `<b>${gisObj.ortschaft} ${
      gisObj.name
    }</b><br>
    ${gisObj.wasserentnahme_l_min_} l/min<br>
    Saughöhe: ${gisObj.geod_tische_saugh_he_m_}m
    ${
      gisObj.saugleitungsl_nge_m_ && `${gisObj.saugleitungsl_nge_m_}`.trim()
        ? `<br>Länge Saugleitung: ${gisObj.saugleitungsl_nge_m_}`
        : ''
    }`,
  });

  return layer;
}
