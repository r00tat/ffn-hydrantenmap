'use client';
import { FirecallItem } from '../../firebase/firestore';
import { CircleMarker } from './CircleMarker';
import { FirecallArea } from './FirecallArea';
import { FirecallAssp } from './FirecallAssp';
import { FirecallConnection } from './FirecallConnection';
import { FirecallDiary } from './FirecallDiary';
import { FirecallDrawing } from './FirecallDrawing';
import { FirecallEinsatzleitung } from './FirecallEl';
import { FirecallGb } from './FirecallGb';
import { FirecallHydrant } from './FirecallHydrant';
import { FirecallItemBase } from './FirecallItemBase';
import { FirecallItemLayer } from './FirecallItemLayer';
import { FirecallItemMarker } from './FirecallItemMarker';
import { FirecallItemLocation } from './FirecallItemLocation';
import { FirecallLine } from './FirecallLine';
import { FirecallRohr } from './FirecallRohr';
import { FirecallSpectrum } from './FirecallSpectrum';
import { FirecallTacticalUnit } from './FirecallTacticalUnit';
import { FirecallVehicle } from './FirecallVehicle';

export const fcItemClasses: { [key: string]: typeof FirecallItemBase } = {
  fallback: FirecallItemBase,
  marker: FirecallItemMarker,
  location: FirecallItemLocation,
  layer: FirecallItemLayer,
  vehicle: FirecallVehicle,
  tacticalUnit: FirecallTacticalUnit,
  line: FirecallLine,
  circle: CircleMarker,
  area: FirecallArea,
  rohr: FirecallRohr,
  connection: FirecallConnection,
  assp: FirecallAssp,
  el: FirecallEinsatzleitung,
  hydrant: FirecallHydrant,
  diary: FirecallDiary,
  drawing: FirecallDrawing,
  gb: FirecallGb,
  spectrum: FirecallSpectrum,
};

export const fcItemNames: { [key: string]: string } = {};

if (typeof 'window' !== undefined) {
  Object.entries(fcItemClasses).forEach(([k, FcClass]) => {
    fcItemNames[k] = new FcClass().markerName();
  });
}
fcItemNames['upload'] = 'Foto / Datei';

export function getItemClass(type: string = 'fallback') {
  return fcItemClasses[type] ?? FirecallItemBase;
}

export function getItemInstance(record?: FirecallItem): FirecallItemBase {
  const cls = getItemClass(record?.type);
  return new cls(record);
}
