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
import { FirecallWasserstand } from './FirecallWasserstand';

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
  wasserstand: FirecallWasserstand,
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

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Wechselt den Typ eines Elements im Dialog und behält, was eingegeben wurde.
 *
 * Werte, die nur die Vorgabe des **bisherigen** Typs sind, bleiben zurück: Der
 * Dialog öffnet als Markierung, und die bringt `color: '#0000ff'` mit. Ginge
 * die Vorgabe mit, stünde sie beim Fahrzeug als gewählte Farbe im Dokument —
 * das Fahrzeug wäre blau, und „Fremdorganisation" bliebe wirkungslos (#836).
 * Der neue Typ setzt danach seine eigenen Vorgaben. Wer genau den Vorgabewert
 * bewusst gewählt hat, verliert ihn beim Typwechsel; das ist der Preis dafür,
 * dass sich Vorgabe und Wahl am Element nicht unterscheiden lassen.
 */
export function changeItemType(
  item: FirecallItemBase,
  type: string
): FirecallItemBase {
  const defaults = getItemInstance({ type: item.type } as FirecallItem).data() as
    unknown as Record<string, unknown>;
  const carried = Object.fromEntries(
    Object.entries(item.data()).filter(
      ([key, value]) => !(key in defaults && sameValue(value, defaults[key]))
    )
  );
  return getItemInstance({ ...carried, type } as FirecallItem);
}
