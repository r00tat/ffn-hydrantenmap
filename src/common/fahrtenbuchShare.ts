import type {
  CounterDefinition,
  FahrtenbuchPerson,
  FahrtenbuchVehicle,
  FuelType,
} from './fahrtenbuch';

/** Top-Level-Collection; die Dokument-ID ist der Token. */
export const FAHRTENBUCH_SHARE_LINK_COLLECTION_ID = 'fahrtenbuchShareLink';

/**
 * Präfix der `createdBy`-Kennung von Einträgen, die über einen geteilten Link
 * erfasst wurden. `canModifyEntry` vergleicht `createdBy` mit der Benutzer-ID —
 * dieses Präfix kann keine Benutzer-ID sein, also kann kein regulärer Benutzer
 * solche Einträge bearbeiten. Nur Admins können sie korrigieren, und das ist
 * gewollt.
 *
 * Dahinter steht die `linkId`, **nicht** der Token: Einträge sind für jedes
 * Gruppenmitglied lesbar, der Token ist das Geheimnis des Links.
 */
export const SHARE_ACTOR_PREFIX = 'share:';

export interface FahrtenbuchShareLink {
  groupId: string;
  /**
   * Nicht geheime Kennung dieses Links. Sie landet in `createdBy` der über den
   * Link erfassten Einträge, damit sich deren Herkunft zuordnen lässt, ohne
   * dass der Token — die Dokument-ID und das gesamte Geheimnis — in ein Feld
   * gerät, das jedes Gruppenmitglied lesen kann.
   */
  linkId: string;
  createdAt: string;
  createdBy: string;
  createdByName: string;
  /** Gesetzt heißt ungültig. Das Dokument bleibt stehen, damit ein
   *  `createdBy: share:<linkId>` später noch zuordenbar ist. */
  revokedAt?: string;
}

/** Fahrzeug in der Form, die die Gastseite braucht — ohne Audit- und Cache-Felder. */
export interface ShareLinkVehicle {
  id: string;
  name: string;
  kennzeichen?: string;
  counters: CounterDefinition[];
  fuelTypes: FuelType[];
  lastCounters?: Record<string, number>;
}

/** Person auf der Gastseite: nur Anzeigename und ID, nie Kontaktdaten. */
export interface ShareLinkPerson {
  id: string;
  name: string;
}

export interface ShareLinkFormData {
  groupName: string;
  vehicles: ShareLinkVehicle[];
  persons: ShareLinkPerson[];
}

/** Was der Gruppen-Dialog über den aktiven Link anzeigt — nie der nackte Token. */
export interface ShareLinkInfo {
  url: string;
  createdAt: string;
  createdByName: string;
}

/**
 * Die Sicherheitsgrenze zur Gastseite: alles, was hier nicht ausdrücklich
 * übernommen wird, verlässt den Server nicht. Deshalb eine Whitelist und kein
 * Weglöschen einzelner Felder — ein neu hinzugefügtes Feld am Fahrzeug landet
 * so nicht versehentlich beim Gast.
 */
export function toShareLinkVehicle(vehicle: FahrtenbuchVehicle): ShareLinkVehicle {
  const projected: ShareLinkVehicle = {
    id: vehicle.id ?? '',
    name: vehicle.name,
    counters: vehicle.counters ?? [],
    fuelTypes: vehicle.fuelTypes ?? [],
  };
  if (vehicle.kennzeichen) projected.kennzeichen = vehicle.kennzeichen;
  if (vehicle.lastCounters) projected.lastCounters = vehicle.lastCounters;
  return projected;
}

/** Dieselbe Whitelist für Personen — Telefonnummern und E-Mails bleiben hier. */
export function toShareLinkPerson(person: FahrtenbuchPerson): ShareLinkPerson {
  return { id: person.id ?? '', name: person.name };
}
