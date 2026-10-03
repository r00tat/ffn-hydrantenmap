import type { Fzg } from '../components/firebase/firestore';
import { isFremdesFahrzeug } from './vehicle-utils';

/**
 * Die Fahrzeuge einer Feuerwehr im Einsatz.
 *
 * `key` ist der normalisierte Name und trägt die Zuordnung; `label` ist die
 * Schreibweise des ersten Fahrzeugs der Gruppe. Fremde Fahrzeuge ohne
 * Feuerwehrangabe (Rettung, Polizei) bilden eine Gruppe mit leerem `key` und
 * `label` — die Bezeichnung dafür setzt die Oberfläche.
 */
export interface VehicleGroup {
  key: string;
  label: string;
  own: boolean;
  vehicles: Fzg[];
}

/**
 * Normalisiert den Namen einer Feuerwehr für den Vergleich.
 *
 * Dieselbe Wehr steht am Fahrzeug je nach Weg verschieden: Die Chip-Leiste
 * schreibt „Neusiedl am See", eine Eingabe von Hand oder ein Import oft
 * „FF Neusiedl am See". Ohne den Abgleich stünde die eigene Feuerwehr als
 * fremde Gruppe da.
 */
export function normalizeFwName(fw: string | undefined): string {
  return (fw ?? '')
    .trim()
    .toLowerCase()
    .replace(/^(ff|bf|feuerwehr|freiwillige feuerwehr)\s+/, '')
    .replace(/\s+/g, ' ');
}

/**
 * Ein eigenes Fahrzeug: nicht als fremd markiert und entweder ohne
 * Feuerwehrangabe oder mit der Feuerwehr des Einsatzes.
 *
 * Ohne Angabe zählt es als eigenes, weil die gewachsenen Einträge der eigenen
 * Wehr oft kein `fw` tragen — sie in eine Gruppe „ohne Feuerwehr" zu schieben,
 * nähme den Fahrzeugen, um die es im Board geht, den Platz vorne.
 */
export function isOwnVehicle(vehicle: Fzg, ownFw: string): boolean {
  if (isFremdesFahrzeug(vehicle)) return false;
  const fw = normalizeFwName(vehicle.fw);
  return fw === '' || fw === normalizeFwName(ownFw);
}

/**
 * Gruppiert die Fahrzeuge nach Feuerwehr: die eigenen zuerst, dann die
 * fremden alphabetisch, fremde ohne Feuerwehr zuletzt. Innerhalb einer Gruppe
 * bleibt die Reihenfolge der Eingabe.
 */
export function groupVehiclesByFw(
  vehicles: Fzg[],
  ownFw: string,
): VehicleGroup[] {
  const own: VehicleGroup = {
    key: normalizeFwName(ownFw),
    label: ownFw,
    own: true,
    vehicles: [],
  };
  const foreign = new Map<string, VehicleGroup>();

  for (const vehicle of vehicles) {
    if (isOwnVehicle(vehicle, ownFw)) {
      own.vehicles.push(vehicle);
      continue;
    }
    const key = normalizeFwName(vehicle.fw);
    let group = foreign.get(key);
    if (!group) {
      group = { key, label: vehicle.fw?.trim() ?? '', own: false, vehicles: [] };
      foreign.set(key, group);
    }
    group.vehicles.push(vehicle);
  }

  const foreignGroups = [...foreign.values()].sort((a, b) => {
    if (!a.key) return 1;
    if (!b.key) return -1;
    return a.label.localeCompare(b.label, 'de');
  });

  return own.vehicles.length > 0 ? [own, ...foreignGroups] : foreignGroups;
}

/** Dieselbe Reihenfolge wie `groupVehiclesByFw`, als flache Liste. */
export function sortVehiclesOwnFirst(vehicles: Fzg[], ownFw: string): Fzg[] {
  return groupVehiclesByFw(vehicles, ownFw).flatMap((g) => g.vehicles);
}
