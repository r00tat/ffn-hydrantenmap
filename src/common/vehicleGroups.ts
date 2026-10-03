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
 * Was die eigene Feuerwehr im Einsatz ausmacht: ihr Name und die Namen ihrer
 * vorgefertigten Fahrzeuge — derselben Liste, aus der die Chip-Leiste
 * Fahrzeuge anlegt.
 */
export interface OwnFleet {
  fw: string;
  /** Normalisiert über `normalizeVehicleName`. */
  vehicleNames: ReadonlySet<string>;
}

export function normalizeVehicleName(name: string | undefined): string {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function ownFleet(fw: string, vehicleNames: Iterable<string>): OwnFleet {
  return {
    fw,
    vehicleNames: new Set(
      Array.from(vehicleNames, normalizeVehicleName).filter(Boolean),
    ),
  };
}

/**
 * Ob ein Fahrzeug zur eigenen Feuerwehr gehört.
 *
 * Erkennungsmerkmal ist in erster Linie der Name: Die eigenen Fahrzeuge sind
 * die vorgefertigten. Die Feuerwehrangabe allein trägt nicht, weil sie im
 * Dialog leer vorbelegt ist — ein Rettungswagen, der von Hand angelegt wurde,
 * hat ebenso keine wie viele gewachsene Einträge der eigenen Wehr.
 *
 * Reihenfolge: Der `fremd`-Schalter und eine ausdrücklich andere Feuerwehr
 * gehen vor — ein „TLFA 4000" aus Weiden gehört nach Weiden, auch wenn die
 * eigene Wehr ein gleichnamiges Fahrzeug führt. Danach ist eigen, was ein
 * vorgefertigtes Fahrzeug ist oder ausdrücklich die eigene Feuerwehr trägt.
 * Alles übrige — keine Feuerwehr, kein bekannter Name — ist fremd.
 */
export function isOwnVehicle(vehicle: Fzg, own: OwnFleet): boolean {
  if (isFremdesFahrzeug(vehicle)) return false;
  const fw = normalizeFwName(vehicle.fw);
  const ownFw = normalizeFwName(own.fw);
  if (fw && fw !== ownFw) return false;
  if (own.vehicleNames.has(normalizeVehicleName(vehicle.name))) return true;
  return fw === ownFw;
}

/**
 * Gruppiert die Fahrzeuge nach Feuerwehr: die eigenen zuerst, dann die
 * fremden alphabetisch, fremde ohne Feuerwehr zuletzt. Innerhalb einer Gruppe
 * bleibt die Reihenfolge der Eingabe.
 */
export function groupVehiclesByFw(
  vehicles: Fzg[],
  fleet: OwnFleet,
): VehicleGroup[] {
  const own: VehicleGroup = {
    key: normalizeFwName(fleet.fw),
    label: fleet.fw,
    own: true,
    vehicles: [],
  };
  const foreign = new Map<string, VehicleGroup>();

  for (const vehicle of vehicles) {
    if (isOwnVehicle(vehicle, fleet)) {
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
export function sortVehiclesOwnFirst(
  vehicles: Fzg[],
  fleet: OwnFleet,
): Fzg[] {
  return groupVehiclesByFw(vehicles, fleet).flatMap((g) => g.vehicles);
}
