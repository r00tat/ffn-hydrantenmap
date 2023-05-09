import L from 'leaflet';
import moment from 'moment';
import { formatTimestamp } from '../../../common/time-format';
import { FirecallItem, Fzg } from '../../firebase/firestore';
import { FirecallItemInfo } from './types';

export const vehicleItemInfo: FirecallItemInfo<Fzg> = {
  name: 'Fahrzeug',
  title: (item) => `${item.name} ${item.fw}`,
  info: (vehicle) => `1:${vehicle.besatzung || 0} ATS: ${vehicle.ats || 0}`,
  body: (vehicle) => `${
    vehicle.alarmierung ? 'Alarmierung: ' + vehicle.alarmierung : ''
  }
  ${vehicle.eintreffen ? ' Eintreffen: ' + vehicle.eintreffen : ''}
  ${vehicle.abruecken ? ' Abrücken: ' + vehicle.abruecken : ''}
  Position ${vehicle.lat} ${vehicle.lng}`,
  fields: {
    name: 'Bezeichnung',
    fw: 'Feuerwehr',
    besatzung: 'Besatzung 1:?',
    ats: 'ATS Träger',
    beschreibung: 'Beschreibung',
    alarmierung: 'Alarmierung',
    eintreffen: 'Eintreffen',
    abruecken: 'Abrücken',
    rotation: 'Drehung in Grad',
  },
  dateFields: ['alarmierung', 'eintreffen', 'abruecken'],
  fieldTypes: { rotation: 'number', ats: 'number' },
  factory: () =>
    ({
      name: '',
      beschreibung: '',
      fw: '',
      type: 'vehicle',
      alarmierung: moment().toISOString(),
      eintreffen: moment().toISOString(),
      ats: 0,
      rotation: '0',
    } as Fzg),
  dialogText: (item) => `Einsatzfahrzeug`,
  icon: (gisObj: FirecallItem) =>
    L.icon({
      iconUrl: `/api/fzg?name=${encodeURIComponent(
        gisObj?.name || ''
      )}&fw=${encodeURIComponent((gisObj as Fzg)?.fw || '')}`,
      iconSize: [45, 20],
      iconAnchor: [20, 0],
      popupAnchor: [0, 0],
    }),
  popupFn: (gisObject: FirecallItem) => {
    const v = gisObject as Fzg;
    return (
      <>
        <b>
          {v.name} {v.fw || ''}
        </b>
        {v.besatzung && Number.parseInt(v.besatzung) > 0 && (
          <>
            <br />
            Besatzung: 1:{v.besatzung}
          </>
        )}
        {v.ats !== undefined && v.ats > 0 && (
          <>
            {!(v.besatzung && Number.parseInt(v.besatzung) > 0) && <br />} (
            {v.ats} ATS)
          </>
        )}
        {v.alarmierung && (
          <>
            <br />
            Alarmierung: {formatTimestamp(v.alarmierung)}
          </>
        )}
        {v.eintreffen && (
          <>
            <br />
            Eintreffen: {formatTimestamp(v.eintreffen)}
          </>
        )}
        {v.abruecken && (
          <>
            <br />
            Abrücken: {formatTimestamp(v.abruecken)}
          </>
        )}
      </>
    );
  },
  titleFn: (v: FirecallItem) => `${v.name} ${(v as Fzg).fw || ''}`,
};
