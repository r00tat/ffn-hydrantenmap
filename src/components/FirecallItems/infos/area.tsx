import { mapPosition } from '../../../hooks/useMapPosition';
import { Area } from '../../firebase/firestore';
import { circleIcon } from '../icons';
import { FirecallItemInfo } from './types';

export const areaInfo: FirecallItemInfo<Area> = {
  name: 'Fläche',
  title: (item) => `Fläche ${item.name}`,
  info: (item) => `Länge: ${item.distance || 0}m`,
  body: (item) => `${item.lat},${item.lng} => ${item.destLat},${item.destLng}`,
  dialogText: (item) => (
    <>
      Um die Fläche zu zeichnen, auf die gewünschten Positionen klicken. Zum
      Abschluss auf einen belibigen Punkt klicken. <br />
      {item.name || ''}
    </>
  ),
  fields: {
    name: 'Bezeichnung',
    beschreibung: 'Beschreibung',
    color: 'Farbe (HTML bzw. Englisch)',
    opacity: 'Deckkraft (in Prozent)',
  },
  dateFields: [],
  factory: () => ({
    type: 'area',
    name: '',
    beschreibung: '',
    destLat: mapPosition.lat,
    destLng: mapPosition.lng + 0.0001,
    positions: JSON.stringify([]),
    color: 'blue',
    opacity: 50,
    datum: new Date().toISOString(),
  }),
  popupFn: (item: Area) => (
    <>
      <b>Fläche {item.name}</b>
    </>
  ),
  titleFn: (item: Area) => `Fläche ${item.name}`,
  icon: (item: Area) => {
    return circleIcon;
  },
};
