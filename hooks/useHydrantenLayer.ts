import L from 'leaflet';
import { GisWgsObject } from '../server/gis-objects';
import useFirestoreDataLayer from './useFirestoreDataLayer';

export default function useHydrantenLayer(map: L.Map) {
  // const [layer, setLayer] = useState(defaultTiles);
  const hydrantenLayer = useFirestoreDataLayer(map, {
    icon: {
      iconUrl: '/icons/hydrant.png',
      iconSize: [26, 31],
      iconAnchor: [13, 28],
      popupAnchor: [0, 0],
    },
    collectionName: 'hydrant',
    titleFn: (
      hydrant: GisWgsObject
    ) => `${hydrant.leistung} l/min (${hydrant.dimension}mm)
    ${hydrant.ortschaft} ${hydrant.name}
    dynamisch: ${hydrant.dynamsicher_druck} bar
    statisch: ${hydrant.statischer_druck} bar`,
    popupFn: (
      hydrant: GisWgsObject
    ) => `<b>${hydrant.leistung} l/min (${hydrant.dimension}mm)</b><br>
    ${hydrant.ortschaft} ${hydrant.name}<br>
    dynamisch: ${hydrant.dynamsicher_druck} bar<br>
    statisch: ${hydrant.statischer_druck} bar<br>`,
  });

  return hydrantenLayer;
}
