import L from 'leaflet';
import { GisWgsObject } from '../server/gis-objects';
import useFirestoreDataLayer from './useFirestoreDataLayer';

export default function useHydrantenLayer(map: L.Map) {
  const hydrantIcon = L.icon({
    iconUrl: '/icons/hydrant.png',
    iconSize: [26, 31],
    iconAnchor: [13, 28],
    popupAnchor: [0, 0],
  });
  const unterflurHydrantIcon = L.icon({
    iconUrl: '/icons/unterflur-hydrant-icon.png',
    iconSize: [26, 31],
    iconAnchor: [13, 28],
    popupAnchor: [0, 0],
  });
  const fuellHydrantIcon = L.icon({
    iconUrl: '/icons/hydrant-icon-fuellen.png',
    iconSize: [26, 31],
    iconAnchor: [13, 28],
    popupAnchor: [0, 0],
  });

  const iconFn = (gisObj: GisWgsObject) => {
    if (gisObj.typ !== 'Überflurhydrant') {
      return unterflurHydrantIcon;
    } else if (gisObj.f_llhydrant?.toLowerCase() === 'ja') {
      return fuellHydrantIcon;
    }

    return hydrantIcon;
  };

  const hydrantenLayer = useFirestoreDataLayer(map, {
    icon: iconFn,
    collectionName: 'hydrant',
    titleFn: (hydrant: GisWgsObject) =>
      `${hydrant.leistung} l/min (${hydrant.dimension}mm)
    ${hydrant.ortschaft} ${hydrant.name}
    dynamisch: ${hydrant.dynamsicher_druck} bar
    statisch: ${hydrant.statischer_druck} bar
    ${hydrant.f_llhydrant?.toLowerCase() === 'ja' ? 'Füllhydrant' : ''}`.trim(),
    popupFn: (hydrant: GisWgsObject) => `
    <b>${hydrant.ortschaft} ${hydrant.name}<br>
    ${hydrant.leistung} l/min (${hydrant.dimension}mm)</b><br>
    dynamisch: ${hydrant.dynamsicher_druck} bar<br>
    statisch: ${hydrant.statischer_druck} bar
    ${hydrant.f_llhydrant?.toLowerCase() === 'ja' ? '<br>Füllhydrant' : ''}`,
  });

  return hydrantenLayer;
}
