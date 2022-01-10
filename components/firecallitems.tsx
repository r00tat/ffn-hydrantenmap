import { FirecallItem, Fzg, Rohr } from './firestore';
import L, { Map } from 'leaflet';
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
  popupFn: (gisObject: T) => string;

  /**
   * render marker title as text
   */
  titleFn: (gisObject: T) => string;

  /**
   * icon
   */
  icon: L.IconOptions | ((gisObject: T) => L.Icon);
}

export interface FirecallItemInfoList {
  [key: string]: FirecallItemInfo;
}

export const firecallItems: FirecallItemInfoList = {
  vehicle: {
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
      alarmierung: 'Alarmierung',
      eintreffen: 'Eintreffen',
      abruecken: 'Abrücken',
    },
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
      return `<b>${v.name} ${v.fw || ''}</b>${
        v.besatzung ? '<br />Besatzung: 1:' + v.besatzung : ''
      } ${v.ats ? `${v.ats} ATS` : ''}
      ${v.alarmierung ? '<br>Alarmierung: ' + v.alarmierung : ''}
      ${v.eintreffen ? '<br>Eintreffen: ' + v.eintreffen : ''}
      ${v.abruecken ? '<br>Abrücken: ' + v.abruecken : ''}
      `;
    },
    titleFn: (v: FirecallItem) => `${v.name} ${(v as Fzg).fw || ''}`,
  } as FirecallItemInfo<Fzg> as FirecallItemInfo<FirecallItem>,
  rohr: {
    name: 'Rohr',
    title: (item) => `${item.art} Rohr ${item.name}`,
    info: (rohr) => `${rohr.durchfluss ? rohr.durchfluss + ' l/min' : ''}`,
    body: (rohr) => ``,
    fields: {
      art: 'Art (C/B oder Wasserwerfer)',
      name: 'Bezeichnung',
      durchfluss: 'Durchfluss (l/min)',
    },
    dialogText: (item) => `C/B Rohr oder Wasserwerfer`,
    popupFn: (gisObject: FirecallItem) => {
      const rohr = gisObject as Rohr;
      return `<b>${rohr.name} ${rohr.art} Rohr</b>${
        rohr.durchfluss ? `<br/>Durchfluss: ${rohr.durchfluss} l/min` : ''
      }`;
    },
    titleFn: (v: FirecallItem) =>
      `${v.name} ${(v as Rohr).art || ''}${
        (v as Rohr).durchfluss ? ` ${(v as Rohr).durchfluss}l/min` : ''
      }`,
    icon: (gisObject: FirecallItem) => {
      const rohr = gisObject as Rohr;
      return L.icon({
        iconUrl: `/icons/rohr${
          ['b', 'c', 'ww', 'wasserwerfer'].indexOf(rohr.art.toLowerCase()) > 0
            ? '-' + rohr.art.toLowerCase()
            : ''
        }.svg`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, 0],
      });
    },
  } as FirecallItemInfo<Rohr> as FirecallItemInfo<FirecallItem>,
  marker: {
    name: 'Marker',
    title: (item) => `${item.name || ''}`,
    info: (item) => ``,
    body: (item) => `${item.beschreibung || ''}`,
    fields: {
      name: 'Bezeichnung',
      beschreibung: 'Beschreibung',
    },
    dialogText: (item) => `Markierung`,
    popupFn: (item: FirecallItem) => {
      return `<b>${item.name}</b><br/>${item.beschreibung || ''}`;
    },
    titleFn: (item: FirecallItem) => `${item.name}\n${item.beschreibung || ''}`,
    icon: (gisObject: FirecallItem) => {
      return L.icon({
        iconUrl: `/icons/marker.svg`,
        iconSize: [30, 30],
        iconAnchor: [15, 30],
        popupAnchor: [0, -25],
      });
    },
  },
  fallback: {
    name: 'Firecallitem',
    title: (item) => `${item.name}`,
    info: (item) => '',
    body: (item) => '',
    dialogText: (item) => item.name || '',
    fields: {
      name: 'Bezeichnung',
    },
    popupFn: (gisObject: FirecallItem) => `${gisObject.name}`,
    titleFn: (gisObject: FirecallItem) => `${gisObject.name}`,
    icon: (gisObject: FirecallItem) => {
      return L.icon({
        iconUrl: `/icons/marker.svg`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, 0],
      });
    },
  },
};

export const firecallItemInfo = (type: string = 'fallback') =>
  firecallItems[type] || firecallItems.fallback;
