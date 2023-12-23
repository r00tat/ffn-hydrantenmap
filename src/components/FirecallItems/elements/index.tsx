import {
  Area,
  Circle,
  Connection,
  FirecallItem,
  Fzg,
  Line,
  Rohr,
} from '../../firebase/firestore';
import { CircleMarker } from './CircleMarker';
import { FirecallArea } from './FirecallArea';
import { FirecallAssp } from './FirecallAssp';
import { FirecallConnection } from './FirecallConnection';
import { FirecallEinsatzleitung } from './FirecallEl';
import { FirecallItemBase } from './FirecallItemBase';
import { FirecallItemMarker } from './FirecallItemMarker';
import { FirecallLine } from './FirecallLine';
import { FirecallRohr } from './FirecallRohr';
import { FirecallVehicle } from './FirecallVehicle';

export const fcItemClasses: { [key: string]: typeof FirecallItemBase } = {
  fallback: FirecallItemBase,
  marker: FirecallItemMarker,
  connection: FirecallConnection,
  circle: CircleMarker,
  area: FirecallArea,
  assp: FirecallAssp,
  el: FirecallEinsatzleitung,
  line: FirecallLine,
  rohr: FirecallRohr,
  vehicle: FirecallVehicle,
};

export const fcItemNames: { [key: string]: string } = {};

Object.entries(fcItemClasses).forEach(([k, FcClass]) => {
  fcItemNames[k] = new FcClass().markerName();
});

export function getItemClass(record?: FirecallItem) {
  switch (record?.type) {
    case 'marker':
      return new FirecallItemMarker(record);
    case 'connection':
      return new FirecallConnection(record as Connection);
    case 'circle':
      return new CircleMarker(record as Circle);
    case 'area':
      return new FirecallArea(record as Area);
    case 'assp':
      return new FirecallAssp(record);
    case 'el':
      return new FirecallEinsatzleitung(record);
    case 'line':
      return new FirecallLine(record as Line);
    case 'rohr':
      return new FirecallRohr(record as Rohr);
    case 'vehicle':
      return new FirecallVehicle(record as Fzg);
    default:
      return new FirecallItemBase(record);
  }
}
