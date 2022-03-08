import L from 'leaflet';
import { WgsObject } from '../common/gis-objects';
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

  const iconFn = (gisObj: WgsObject) => {
    if (gisObj.typ !== 'Überflurhydrant') {
      return unterflurHydrantIcon;
    } else if (gisObj.f_llhydrant?.toLowerCase() === 'ja') {
      return fuellHydrantIcon;
    }

    return hydrantIcon;
  };

  const hydrantenLayer = useFirestoreDataLayer(map, {
    icon: iconFn,
    // collectionName: 'hydranten2',
    collectionName: 'hydrant2',
    cluster: true,
    titleFn: (hydrant: WgsObject) =>
      `${hydrant.leistung ? hydrant.leistung + ' l/min ' : ''} (${
        hydrant.dimension
      }mm)
    ${hydrant.ortschaft} ${hydrant.name}
    dynamisch: ${hydrant.dynamischer_druck} bar
    statisch: ${hydrant.statischer_druck} bar
    ${
      hydrant.fuellhydrant?.toLowerCase() === 'ja' ? 'Füllhydrant' : ''
    }`.trim(),
    popupFn: (hydrant: WgsObject) => `
    <b>${hydrant.ortschaft} ${hydrant.name}<br>
    ${hydrant.leistung ? hydrant.leistung + ' l/min ' : ''} (${
      hydrant.dimension
    }mm)</b><br>
    dynamisch: ${hydrant.dynamischer_druck} bar<br>
    statisch: ${hydrant.statischer_druck} bar
    ${hydrant.fuellhydrant?.toLowerCase() === 'ja' ? '<br>Füllhydrant' : ''}`,
  });

  return hydrantenLayer;
}
