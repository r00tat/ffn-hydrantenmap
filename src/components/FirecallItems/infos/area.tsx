import { mapPosition } from '../../../hooks/useMapPosition';
import { Connection } from '../../firebase/firestore';
import { connectionIcon } from '../icons';
import { FirecallItemInfo } from './types';

export const areaInfo: FirecallItemInfo<Connection> = {
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
  },
  dateFields: [],
  factory: () => ({
    type: 'connection',
    name: '',
    beschreibung: '',
    destLat: mapPosition.lat,
    destLng: mapPosition.lng + 0.0001,
    positions: JSON.stringify([]),
    color: 'blue',
  }),
  popupFn: (item: Connection) => (
    <>
      <b>Fläche {item.name}</b>
    </>
  ),
  titleFn: (item: Connection) => `Fläche ${item.name}`,
  icon: (item: Connection) => {
    return connectionIcon;
  },
};
