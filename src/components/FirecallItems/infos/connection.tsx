import { latLngPosition, LatLngPosition } from '../../../common/geo';
import { toLatLng } from '../../../hooks/constants';
import { mapPosition } from '../../../hooks/useMapPosition';
import { Connection } from '../../firebase/firestore';
import { circleIcon } from '../icons';
import { FirecallItemInfo } from './types';

export const getConnectionPositions = (
  record: Connection
): LatLngPosition[] => {
  let p: LatLngPosition[] = [
    latLngPosition(record.lat, record.lng),
    [record.destLat, record.destLng],
  ];

  try {
    if (record.positions) {
      p = JSON.parse(record.positions);
    }
  } catch (err) {
    console.warn(`unable to parse positions ${err} ${record.positions}`);
  }
  return p;
};

export const calculateDistance = (positions: LatLngPosition[]): number => {
  let distance = 0;
  positions.forEach((p, index) => {
    if (index > 0) {
      distance += toLatLng(p[0], p[1]).distanceTo(
        toLatLng(positions[index - 1][0], positions[index - 1][1])
      );
    }
  });
  return distance;
};

export const calculateDistanceForConnection = (record: Connection) =>
  Math.round(calculateDistance(getConnectionPositions(record)));

export const connectionInfo: FirecallItemInfo<Connection> = {
  name: 'Leitung',
  title: (item) => `Leitung ${item.name}`,
  info: (item) => `Länge: ${item.distance || 0}m`,
  body: (item) => `${item.lat},${item.lng} => ${item.destLat},${item.destLng}`,
  dialogText: (item) => (
    <>
      Um die Leitung zu zeichnen, auf die gewünschten Positionen klicken. Zum
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
    datum: new Date().toISOString(),
  }),
  popupFn: (item: Connection) => (
    <>
      <b>Leitung {item.name}</b>
      <br />
      {item.distance || 0}
      m, {Math.ceil((item.distance || 0) / 20)} B Schläuche
    </>
  ),
  titleFn: (item: Connection) => `Leitung ${item.name}: ${item.distance || 0}m`,
  icon: (item: Connection) => {
    return circleIcon;
  },
};
