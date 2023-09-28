import { mapPosition } from '../../../hooks/useMapPosition';
import { Line } from '../../firebase/firestore';
import { connectionIcon } from '../icons';
import { FirecallItemInfo } from './types';

export const lineInfo: FirecallItemInfo<Line> = {
  name: 'Linie',
  title: (item) => `Linie ${item.name}`,
  info: (item) => `Länge: ${item.distance || 0}m`,
  body: (item) => `${item.lat},${item.lng} => ${item.destLat},${item.destLng}`,
  dialogText: (item) => (
    <>
      Um die Linie zu zeichnen, auf die gewünschten Positionen klicken. Zum
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
    type: 'line',
    name: '',
    beschreibung: '',
    destLat: mapPosition.lat,
    destLng: mapPosition.lng + 0.0001,
    positions: JSON.stringify([]),
    color: 'green',
    opacity: 100,
  }),
  popupFn: (item: Line) => (
    <>
      <b>Linie {item.name}</b>
      <br />
      {item.distance || 0}m
    </>
  ),
  titleFn: (item: Line) => `Linie ${item.name}: ${item.distance || 0}m`,
  icon: (item: Line) => {
    return connectionIcon;
  },
};
