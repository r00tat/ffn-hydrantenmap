import { toLatLng } from '../../../hooks/constants';
import { mapPosition } from '../../../hooks/useMapPosition';
import { Connection } from '../../firebase/firestore';
import { connectionIcon } from '../icons';
import { FirecallItemInfo } from './types';
export const connectionInfo: FirecallItemInfo<Connection> = {
  name: 'Leitung',
  title: (item) => `Leitung ${item.name}`,
  info: (item) =>
    `Länge: ${Math.round(
      toLatLng(item.lat, item.lng).distanceTo(
        toLatLng(item.destLat, item.destLng)
      )
    )}m`,
  body: (item) => `${item.lat},${item.lng} => ${item.destLat},${item.destLng}`,
  dialogText: (item) => item.name || '',
  fields: {
    name: 'Bezeichnung',
    beschreibung: 'Beschreibung',
  },
  dateFields: [],
  factory: () => ({
    type: 'connection',
    name: '',
    beschreibung: '',
    destLat: mapPosition.lat,
    destLng: mapPosition.lng + 0.0001,
  }),
  popupFn: (item: Connection) => (
    <>
      <b>Leitung {item.name}</b>
      <br />
      {Math.round(
        toLatLng(item.lat, item.lng).distanceTo(
          toLatLng(item.destLat, item.destLng)
        )
      )}
      m, min{' '}
      {Math.ceil(
        toLatLng(item.lat, item.lng).distanceTo(
          toLatLng(item.destLat, item.destLng)
        ) / 20
      )}{' '}
      B Schläuche
    </>
  ),
  titleFn: (item: Connection) =>
    `Leitung ${item.name}: ${Math.round(
      toLatLng(item.lat, item.lng).distanceTo(
        toLatLng(item.destLat, item.destLng)
      )
    )}m`,
  icon: (item: Connection) => {
    return connectionIcon;
  },
};
