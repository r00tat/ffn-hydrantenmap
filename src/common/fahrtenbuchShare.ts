import type {
  CounterDefinition,
  FahrtenbuchPerson,
  FahrtenbuchVehicle,
  FahrtenbuchVehicleKategorie,
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
  kategorie?: FahrtenbuchVehicleKategorie;
}

/** Person auf der Gastseite: nur Anzeigename und ID, nie Kontaktdaten. */
export interface ShareLinkPerson {
  id: string;
  name: string;
}

/**
 * Ein Einsatz für die Auswahl auf der Gastseite.
 *
 * Bewusst nur Name und Zeiten: Koordinaten, Beschreibung und Alarm-IDen haben
 * hinter einem anmeldefreien Link nichts zu suchen. Die Zeiten sind der Grund,
 * warum die Auswahl überhaupt etwas spart — sie belegen Abfahrt und Ankunft vor.
 */
export interface ShareLinkFirecall {
  id: string;
  name: string;
  /** Alarmierungszeitpunkt (`firecall.date`). */
  date?: string;
  abruecken?: string;
}

export function toShareLinkFirecall(firecall: {
  id?: string;
  name?: string;
  date?: string;
  abruecken?: string;
}): ShareLinkFirecall {
  return {
    id: firecall.id as string,
    name: firecall.name ?? '',
    date: firecall.date,
    abruecken: firecall.abruecken,
  };
}

/**
 * Wie viele Einsätze die Gastseite zur Auswahl bekommt.
 *
 * Kürzer als die 50 der angemeldeten Seite: Wer über den QR-Code am Fahrzeug
 * einträgt, trägt eine Fahrt von heute ein, nicht eine von vor einem Jahr — und
 * hinter einem anmeldefreien Link soll nicht die halbe Einsatzhistorie stehen.
 */
export const SHARE_LINK_FIRECALL_LIMIT = 10;

export interface ShareLinkFormData {
  groupName: string;
  vehicles: ShareLinkVehicle[];
  persons: ShareLinkPerson[];
  /** Die letzten Einsätze der Gruppe, neuester zuerst. */
  firecalls: ShareLinkFirecall[];
}

/**
 * Query-Parameter, mit dem ein Share-Link ein Fahrzeug im Formular vorbelegt.
 * Deutsch wie die Route selbst (`/fahrtenbuch/teilen/…`) — der Link landet als
 * Klartext unter jedem ausgedruckten QR-Code.
 *
 * Die Vorauswahl ist kein Zwang: sie füllt das Feld, ersetzt es aber nicht. Ein
 * Aufkleber kann im falschen Fahrzeug landen oder umgehängt werden, und dann
 * muss die Fahrt trotzdem richtig eingetragen werden können.
 */
export const SHARE_LINK_VEHICLE_PARAM = 'fahrzeug';

/**
 * Hängt die Fahrzeug-Vorauswahl an einen Share-Link. Zusammengesetzt statt über
 * `URL`, damit dieselbe Funktion auch für einen relativen Pfad trägt.
 */
export function shareLinkUrlWithVehicle(
  url: string,
  vehicleId?: string,
): string {
  if (!vehicleId) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${SHARE_LINK_VEHICLE_PARAM}=${encodeURIComponent(vehicleId)}`;
}

/**
 * Nimmt den Parameter nur an, wenn er auf ein Fahrzeug der Gruppe zeigt.
 *
 * Ein Aufkleber überlebt das Fahrzeug: wird es deaktiviert, umbenannt oder
 * gelöscht, fällt die Seite still auf die Fahrzeugauswahl zurück statt einen
 * Wert vorzubelegen, den der Server beim Speichern ablehnt. Ein mehrfach
 * gesetzter Parameter — von Next als Array geliefert — ist nicht eindeutig und
 * wird deshalb gar nicht ausgewertet.
 */
export function resolveShareLinkVehicleId(
  raw: string | string[] | undefined,
  vehicles: { id: string }[],
): string | undefined {
  if (typeof raw !== 'string' || !raw) return undefined;
  return vehicles.some((vehicle) => vehicle.id === raw) ? raw : undefined;
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
  // Die Kategorie gruppiert die Auswahl auch auf der Gastseite. Sie verrät
  // nichts, was der Name nicht ohnehin sagt.
  if (vehicle.kategorie) projected.kategorie = vehicle.kategorie;
  return projected;
}

/** Dieselbe Whitelist für Personen — Telefonnummern und E-Mails bleiben hier. */
export function toShareLinkPerson(person: FahrtenbuchPerson): ShareLinkPerson {
  return { id: person.id ?? '', name: person.name };
}
