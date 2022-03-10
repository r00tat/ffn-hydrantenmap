import L from 'leaflet';
import { ReactNode } from 'react';
import { toLatLng } from '../../hooks/constants';
import { mapPosition } from '../../hooks/useMapPosition';
import {
  Connection,
  Diary,
  FirecallItem,
  Fzg,
  Rohr,
} from '../firebase/firestore';
import {
  asspIcon,
  connectionIcon,
  elIcon,
  fallbackIcon,
  markerIcon,
} from './icons';
export interface FirecallItemInfo<T = FirecallItem> {
  name: string;
  title: (item: T) => string;
  info: (item: T) => string;
  body: (item: T) => string;
  dialogText: (item: T) => string;
  fields: {
    [fieldName: string]: string;
  };
  /**
   * render popup html
   */
  popupFn: (gisObject: T) => string | ReactNode;

  /**
   * render marker title as text
   */
  titleFn: (gisObject: T) => string;

  /**
   * icon
   */
  icon: L.IconOptions | ((gisObject: T) => L.Icon);

  /**
   * create a new element
   */
  factory: () => T;
}

export interface FirecallItemInfoList<T = FirecallItem> {
  [key: string]: FirecallItemInfo<T>;
}

export const rohrItemInfo: FirecallItemInfo<Rohr> = {
  name: 'Rohr',
  title: (item) => `${item.art} Rohr ${item.name}`,
  info: (rohr) => `${rohr.durchfluss ? rohr.durchfluss + ' l/min' : ''}`,
  body: (rohr) => ``,
  fields: {
    art: 'Art (C/B oder Wasserwerfer)',
    name: 'Bezeichnung',
    durchfluss: 'Durchfluss (l/min)',
  },
  factory: () =>
    ({
      art: 'C',
      name: '',
      durchfluss: 100,
      type: 'rohr',
    } as Rohr),
  dialogText: (item) => `C/B Rohr oder Wasserwerfer`,
  popupFn: (gisObject: FirecallItem) => {
    const rohr = gisObject as Rohr;
    return (
      <>
        <b>
          {rohr.name} {rohr.art} Rohr
        </b>
        {rohr.durchfluss && (
          <>
            <br />
            Durchfluss: {rohr.durchfluss} l/min
          </>
        )}
      </>
    );
  },
  titleFn: (v: FirecallItem) =>
    `${v.name} ${(v as Rohr).art || ''}${
      (v as Rohr).durchfluss ? ` ${(v as Rohr).durchfluss}l/min` : ''
    }`,
  icon: (gisObject: FirecallItem) => {
    const rohr = gisObject as Rohr;
    return L.icon({
      iconUrl: `/icons/rohr${
        ['b', 'c', 'ww', 'wasserwerfer'].indexOf(rohr.art.toLowerCase()) >= 0
          ? '-' + rohr.art.toLowerCase()
          : ''
      }.svg`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, 0],
    });
  },
};

export const vehicleItemInfo: FirecallItemInfo<Fzg> = {
  name: 'Fahrzeug',
  title: (item) => `${item.name} ${item.fw}`,
  info: (vehicle) => `1:${vehicle.besatzung || 0} ATS: ${vehicle.ats || 0}`,
  body: (vehicle) => `${
    vehicle.alarmierung ? 'Alarmierung: ' + vehicle.alarmierung : ''
  }
  ${vehicle.eintreffen ? ' Eintreffen: ' + vehicle.eintreffen : ''}
  ${vehicle.abruecken ? ' Abrücken: ' + vehicle.abruecken : ''}`,
  fields: {
    name: 'Bezeichnung',
    fw: 'Feuerwehr',
    besatzung: 'Besatzung 1:?',
    ats: 'ATS Träger',
    beschreibung: 'Beschreibung',
    alarmierung: 'Alarmierung',
    eintreffen: 'Eintreffen',
    abruecken: 'Abrücken',
  },
  factory: () =>
    ({
      name: '',
      beschreibung: '',
      fw: '',
      type: 'vehicle',
      alarmierung: new Date().toLocaleString('de-DE'),
      eintreffen: new Date().toLocaleString('de-DE'),
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
        {v.besatzung && (
          <>
            <br />
            Besatzung: 1: {v.besatzung}
          </>
        )}
        {v.ats && <>{v.ats} ATS</>}
        {v.alarmierung && (
          <>
            <br />
            Alarmierung: {v.alarmierung}
          </>
        )}
        {v.eintreffen && (
          <>
            <br />
            Eintreffen: {v.eintreffen}
          </>
        )}
        {v.abruecken && (
          <>
            <br />
            Abrücken: {v.abruecken}{' '}
          </>
        )}
      </>
    );
  },
  titleFn: (v: FirecallItem) => `${v.name} ${(v as Fzg).fw || ''}`,
};

export const diaryItemInfo: FirecallItemInfo<Diary> = {
  name: 'Einsatztagebuch',
  title: (item) => `${item.name || ''}`,
  info: (item) =>
    `${item.datum} ${item.von || item.an ? `${item.von} => ${item.an}` : ''}`,
  body: (item) => `${item.beschreibung || ''}`,
  fields: {
    name: 'Bezeichnung',
    beschreibung: 'Beschreibung',
    von: 'Von',
    an: 'An',
    datum: 'Zeitstempel',
    erledigt: 'erledigt',
  },
  factory: () => ({
    type: 'diary',
    name: '',
    beschreibung: '',
    von: '',
    an: '',
    datum: new Date().toLocaleString('de-DE'),
    erledigt: '',
  }),
  dialogText: (item) => `Eintrag ${item.name || ''}`,
  popupFn: (item: FirecallItem) => {
    return (
      <>
        <b>Eintrag {item.name}</b>
        <br />
        {item.beschreibung || ''}
      </>
    );
  },
  titleFn: (item: FirecallItem) =>
    `Eintrag ${item.name}\n${item.beschreibung || ''}`,
  icon: (gisObject: FirecallItem) => {
    return markerIcon;
  },
};

export const connectionInfo: FirecallItemInfo<Connection> = {
  name: 'Leitung',
  title: (item) => `Leitung ${item.name}`,
  info: (item) =>
    `Länge: ${Math.round(
      toLatLng(item.lat, item.lng).distanceTo(
        toLatLng(item.destLat, item.destLng)
      )
    )}m`,
  body: (item) => '',
  dialogText: (item) => item.name || '',
  fields: {
    name: 'Bezeichnung',
    beschreibung: 'Beschreibung',
  },
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

export const firecallItems: FirecallItemInfoList = {
  vehicle: vehicleItemInfo as FirecallItemInfo<FirecallItem>,
  rohr: rohrItemInfo as unknown as FirecallItemInfo<FirecallItem>,
  connection: connectionInfo as unknown as FirecallItemInfo<FirecallItem>,
  marker: {
    name: 'Marker',
    title: (item) => `${item.name || ''}`,
    info: (item) => ``,
    body: (item) => `${item.beschreibung || ''}`,
    fields: {
      name: 'Bezeichnung',
      beschreibung: 'Beschreibung',
    },
    factory: () => ({
      type: 'marker',
      name: '',
      beschreibung: '',
      datum: '',
    }),
    dialogText: (item) => `Markierung`,
    popupFn: (item: FirecallItem) => {
      return (
        <>
          <b>{item.name}</b>
          <br />
          {item.beschreibung || ''}
        </>
      );
    },
    titleFn: (item: FirecallItem) => `${item.name}\n${item.beschreibung || ''}`,
    icon: (gisObject: FirecallItem) => {
      return markerIcon;
    },
  },
  el: {
    name: 'Einsatzleitung',
    title: (item) => `Einsatzleitung ${item.name || ''}`,
    info: (item) => ``,
    body: (item) => `${item.beschreibung || ''}`,
    fields: {
      name: 'Bezeichnung',
      beschreibung: 'Beschreibung',
    },
    factory: () => ({
      type: 'el',
      name: '',
      beschreibung: '',
    }),
    dialogText: (item) => `Einsatzleitung`,
    popupFn: (item: FirecallItem) => {
      return (
        <>
          <b>Einsatzleitung {item.name}</b>
          <br />
          {item.beschreibung || ''}
        </>
      );
    },
    titleFn: (item: FirecallItem) =>
      `ELung ${item.name}\n${item.beschreibung || ''}`,
    icon: (gisObject: FirecallItem) => {
      return elIcon;
    },
  },
  assp: {
    name: 'Atemschutzsammelplatz',
    title: (item) => `ASSP ${item.name || ''}`,
    info: (item) => ``,
    body: (item) => `${item.beschreibung || ''}`,
    fields: {
      name: 'Bezeichnung',
      beschreibung: 'Beschreibung',
    },
    factory: () => ({
      type: 'assp',
      name: '',
      beschreibung: '',
    }),
    dialogText: (item) => `ASSP`,
    popupFn: (item: FirecallItem) => {
      return (
        <>
          <b>ASSP {item.name}</b>
          <br />
          {item.beschreibung || ''}
        </>
      );
    },
    titleFn: (item: FirecallItem) =>
      `ASSP ${item.name}\n${item.beschreibung || ''}`,
    icon: (gisObject: FirecallItem) => {
      return asspIcon;
    },
  },
  diary: diaryItemInfo as unknown as FirecallItemInfo<FirecallItem>,
  fallback: {
    name: 'Firecallitem',
    title: (item) => `${item.name}`,
    info: (item) => '',
    body: (item) => '',
    dialogText: (item) => item.name || '',
    fields: {
      name: 'Bezeichnung',
      beschreibung: 'Beschreibung',
    },
    factory: () => ({
      type: 'fallback',
      name: '',
    }),
    popupFn: (gisObject: FirecallItem) => `${gisObject.name}`,
    titleFn: (gisObject: FirecallItem) => `${gisObject.name}`,
    icon: (gisObject: FirecallItem) => {
      return fallbackIcon;
    },
  },
};

export const firecallItemInfo = (type: string = 'fallback') =>
  firecallItems[type] || firecallItems.fallback;
