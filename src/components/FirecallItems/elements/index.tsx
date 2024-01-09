import {
  Area,
  Circle,
  Connection,
  Diary,
  FirecallItem,
  Fzg,
  Line,
  Rohr,
  FcMarker,
  GeschaeftsbuchEintrag,
} from '../../firebase/firestore';
import { CircleMarker } from './CircleMarker';
import { FirecallArea } from './FirecallArea';
import { FirecallAssp } from './FirecallAssp';
import { FirecallConnection } from './FirecallConnection';
import { FirecallDiary } from './FirecallDiary';
import { FirecallEinsatzleitung } from './FirecallEl';
import { FirecallGb } from './FirecallGb';
import { FirecallItemBase } from './FirecallItemBase';
import { FirecallItemMarker } from './FirecallItemMarker';
import { FirecallLine } from './FirecallLine';
import { FirecallRohr } from './FirecallRohr';
import { FirecallVehicle } from './FirecallVehicle';

export const fcItemClasses: { [key: string]: typeof FirecallItemBase } = {
  fallback: FirecallItemBase,
  marker: FirecallItemMarker,
  rohr: FirecallRohr,
  connection: FirecallConnection,
  diary: FirecallDiary,
  line: FirecallLine,
  circle: CircleMarker,
  area: FirecallArea,
  assp: FirecallAssp,
  el: FirecallEinsatzleitung,
  vehicle: FirecallVehicle,
};

export const fcItemNames: { [key: string]: string } = {};

Object.entries(fcItemClasses).forEach(([k, FcClass]) => {
  fcItemNames[k] = new FcClass().markerName();
});

export function getItemClass(record?: FirecallItem): FirecallItemBase {
  switch (record?.type) {
    case 'marker':
      return new FirecallItemMarker(record as FcMarker);
    case 'rohr':
      return new FirecallRohr(record as Rohr);
    case 'connection':
      return new FirecallConnection(record as Connection);
    case 'diary':
      return new FirecallDiary(record as Diary);
    case 'line':
      return new FirecallLine(record as Line);
    case 'circle':
      return new CircleMarker(record as Circle);
    case 'area':
      return new FirecallArea(record as Area);
    case 'vehicle':
      return new FirecallVehicle(record as Fzg);
    case 'assp':
      return new FirecallAssp(record);
    case 'el':
      return new FirecallEinsatzleitung(record);
    case 'gb':
      return new FirecallGb(record as GeschaeftsbuchEintrag);
    default:
      return new FirecallItemBase(record);
  }
}
