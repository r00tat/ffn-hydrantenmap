import { Circle } from '../../firebase/firestore';
import { circleIcon } from '../icons';
import { FirecallItemInfo } from './types';

export const circleInfo: FirecallItemInfo<Circle> = {
  name: 'Kreis',
  title: (item) => `Kreis ${item.name}`,
  info: (item) => `Radius: ${item.radius || 0}m`,
  body: (item) => `${item.lat},${item.lng}\nUmkreis:  ${item.radius || 0}m`,
  dialogText: (item) => (
    <>
      Um die Kreis zu zeichnen, auf die gewünschten Positionen klicken. Zum
      Abschluss auf einen belibigen Punkt klicken. <br />
      {item.name || ''}
    </>
  ),
  fields: {
    name: 'Bezeichnung',
    radius: 'Radius (m)',
    beschreibung: 'Beschreibung',
    color: 'Farbe (HTML bzw. Englisch)',
    opacity: 'Deckkraft (in Prozent)',
  },
  dateFields: [],
  factory: () => ({
    type: 'circle',
    name: '',
    beschreibung: '',
    color: 'green',
    radius: 50,
    datum: new Date().toISOString(),
  }),
  popupFn: (item: Circle) => (
    <>
      <b>Kreis {item.name}</b>
      <br />
      {item.radius || 0}m
    </>
  ),
  titleFn: (item: Circle) => `Kreis ${item.name}: Radius ${item.radius || 0}m`,
  icon: (item: Circle) => {
    return circleIcon;
  },
};
