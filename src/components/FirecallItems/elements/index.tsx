'use client';
import { FirecallItem } from '../../firebase/firestore';
import { CircleMarker } from './CircleMarker';
import { FirecallArea } from './FirecallArea';
import { FirecallAssp } from './FirecallAssp';
import { FirecallConnection } from './FirecallConnection';
import { FirecallDiary } from './FirecallDiary';
import { FirecallEinsatzleitung } from './FirecallEl';
import { FirecallGb } from './FirecallGb';
import { FirecallHydrant } from './FirecallHydrant';
import { FirecallItemBase } from './FirecallItemBase';
import { FirecallItemLayer } from './FirecallItemLayer';
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
  gb: FirecallGb,
  layer: FirecallItemLayer,
  hydrant: FirecallHydrant,
};

export const fcItemNames: { [key: string]: string } = {};

if (typeof 'window' !== undefined) {
  Object.entries(fcItemClasses).forEach(([k, FcClass]) => {
    fcItemNames[k] = new FcClass().markerName();
  });
}

export function getItemClass(type: string = 'fallback') {
  return fcItemClasses[type] ?? FirecallItemBase;
}

export function getItemInstance(record?: FirecallItem): FirecallItemBase {
  const cls = getItemClass(record?.type);
  return new cls(record);
}
