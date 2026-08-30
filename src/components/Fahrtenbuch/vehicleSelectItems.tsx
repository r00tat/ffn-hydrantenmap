'use client';

import ListSubheader from '@mui/material/ListSubheader';
import MenuItem from '@mui/material/MenuItem';
import type { ReactNode } from 'react';
import {
  FAHRTENBUCH_VEHICLE_KATEGORIEN,
  vehicleKategorie,
  type FahrtenbuchVehicleKategorie,
} from '../../common/fahrtenbuch';

/**
 * Nur, was ein Eintrag der Liste braucht. Absichtlich schmaler als
 * `FahrtenbuchVehicle`: Die Gastseite reicht eine Projektion durch, und das
 * Eingabeformular ein `EntryFormVehicle` — beide sollen dieselbe Liste bauen.
 */
export interface VehicleSelectOption {
  id?: string;
  name: string;
  kategorie?: FahrtenbuchVehicleKategorie;
}

/**
 * Die Einträge eines Fahrzeug-Auswahlfelds, nach Kategorie gruppiert.
 *
 * Ein flaches Array statt gruppierender Elemente: `Select` liest seine Kinder
 * selbst aus, um zum `value` die Beschriftung zu finden. Steckten die
 * `MenuItem`s in einem `<div>` je Gruppe, stünde im geschlossenen Feld nichts.
 * `ListSubheader` ist genau dafür da — es ist nicht anwählbar und wird beim
 * Tastaturlauf übersprungen.
 *
 * Die Überschrift erscheint nur, wenn wirklich mehr als eine Kategorie
 * vorkommt: Eine Wehr mit lauter Fahrzeugen bekommt sonst eine einzelne
 * Überschrift „Fahrzeug" über der vollständigen Liste, die nichts trennt.
 */
export function vehicleSelectItems(
  vehicles: VehicleSelectOption[],
  label: (kategorie: FahrtenbuchVehicleKategorie) => string,
): ReactNode[] {
  const proKategorie = new Map<
    FahrtenbuchVehicleKategorie,
    VehicleSelectOption[]
  >();
  for (const vehicle of vehicles) {
    const kategorie = vehicleKategorie(vehicle);
    const liste = proKategorie.get(kategorie);
    if (liste) liste.push(vehicle);
    else proKategorie.set(kategorie, [vehicle]);
  }

  const mitUeberschrift = proKategorie.size > 1;
  const items: ReactNode[] = [];
  for (const kategorie of FAHRTENBUCH_VEHICLE_KATEGORIEN) {
    const liste = proKategorie.get(kategorie);
    if (!liste || liste.length === 0) continue;
    if (mitUeberschrift) {
      items.push(
        <ListSubheader key={`kat-${kategorie}`}>
          {label(kategorie)}
        </ListSubheader>,
      );
    }
    for (const vehicle of liste) {
      items.push(
        <MenuItem key={vehicle.id} value={vehicle.id}>
          {vehicle.name}
        </MenuItem>,
      );
    }
  }
  return items;
}
