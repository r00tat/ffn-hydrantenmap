import {
  applyCounterDiffs,
  FUEL_TYPES,
  validateEntryInput,
  type CounterDefinition,
  type CounterReading,
  type CounterSource,
  type FahrtenbuchEntry,
  type FahrtenbuchVehicle,
  type FahrtZweck,
  type FuelType,
} from '../../common/fahrtenbuch';

/**
 * Die Eingabe des Clients. `vehicleName` steht bewusst nicht darin: Der Name
 * kommt aus dem geladenen Fahrzeugdokument, sonst könnte eine Fahrt dauerhaft
 * dem falschen Fahrzeug zugeschrieben werden.
 */
export interface FahrtenbuchEntryInput {
  vehicleId: string;
  driverId?: string;
  driverName: string;
  zweck: FahrtZweck;
  firecallId?: string;
  firecallName?: string;
  ziel: string;
  abfahrt: string;
  ankunft: string;
  counters: Record<string, CounterReading>;
  betriebsmittel?: Partial<Record<FuelType, number>>;
  hinweise?: string;
  defekt?: boolean;
}

export interface EntryActor {
  userId: string;
  userName: string;
  now: string;
}

/**
 * Serverseitig abgeleitete Werte. Steht bewusst nicht in
 * `FahrtenbuchEntryInput`: Der Client darf nicht behaupten, ein Wert stamme
 * aus einer Route.
 */
export interface EntryDerivation {
  counterSources?: Record<string, CounterSource>;
  routeDistanceM?: number;
}

/** Das geladene Fahrzeugdokument — die Quelle für Name und Zählerdefinitionen. */
export type EntryVehicle = Partial<
  Pick<FahrtenbuchVehicle, 'name' | 'counters'>
>;

/**
 * Behält nur bekannte Treibstoffarten mit endlichen Zahlenwerten — dieselbe
 * Bereinigung, die `applyCounterDiffs` für die Zähler leistet.
 */
function sanitizeBetriebsmittel(
  betriebsmittel: Partial<Record<FuelType, number>> | undefined,
): Partial<Record<FuelType, number>> {
  const result: Partial<Record<FuelType, number>> = {};
  if (!betriebsmittel) return result;
  for (const fuel of FUEL_TYPES) {
    const value = betriebsmittel[fuel];
    if (typeof value === 'number' && Number.isFinite(value)) {
      result[fuel] = value;
    }
  }
  return result;
}

/**
 * Baut das zu speichernde Dokument. Systemfelder werden immer serverseitig
 * gesetzt, Clientwerte dafür verworfen. Wirft bei ungültiger Eingabe.
 */
export function buildEntryDocument(
  vehicle: EntryVehicle,
  input: FahrtenbuchEntryInput,
  group: string,
  actor: EntryActor,
  derivation?: EntryDerivation,
): FahrtenbuchEntry {
  const definitions: CounterDefinition[] = vehicle.counters ?? [];
  const errors = validateEntryInput(definitions, {
    vehicleId: input.vehicleId,
    driverName: input.driverName,
    zweck: input.zweck,
    ziel: input.ziel,
    abfahrt: input.abfahrt,
    ankunft: input.ankunft,
    counters: input.counters ?? {},
  });
  if (errors.length > 0) {
    throw new Error(`invalid fahrtenbuch entry: ${errors.join(', ')}`);
  }

  const isEinsatz = input.zweck === 'einsatz';

  const doc: FahrtenbuchEntry = {
    vehicleId: input.vehicleId,
    vehicleName: vehicle.name ?? '',
    driverName: input.driverName.trim(),
    zweck: input.zweck,
    ziel: (input.ziel ?? '').trim(),
    abfahrt: input.abfahrt,
    ankunft: input.ankunft,
    counters: applyCounterDiffs(definitions, input.counters ?? {}),
    group,
    deleted: false,
    createdAt: actor.now,
    createdBy: actor.userId,
    createdByName: actor.userName,
    updatedAt: actor.now,
    updatedBy: actor.userId,
  };

  if (input.driverId) doc.driverId = input.driverId;
  if (isEinsatz && input.firecallId) doc.firecallId = input.firecallId;
  if (isEinsatz && input.firecallName) doc.firecallName = input.firecallName;
  const betriebsmittel = sanitizeBetriebsmittel(input.betriebsmittel);
  if (Object.keys(betriebsmittel).length > 0) {
    doc.betriebsmittel = betriebsmittel;
  }
  if (input.hinweise?.trim()) doc.hinweise = input.hinweise.trim();
  if (input.defekt) doc.defekt = true;

  // Leere Objekte werden weggelassen, damit ein von Hand erfasster Eintrag
  // nicht so aussieht, als sei etwas abgeleitet worden.
  if (
    derivation?.counterSources &&
    Object.keys(derivation.counterSources).length > 0
  ) {
    doc.counterSources = derivation.counterSources;
  }
  if (derivation?.routeDistanceM !== undefined) {
    doc.routeDistanceM = derivation.routeDistanceM;
  }

  return doc;
}

export function canModifyEntry(
  entry: Pick<FahrtenbuchEntry, 'createdBy'>,
  userId: string,
  isAdmin: boolean,
): boolean {
  return isAdmin || entry.createdBy === userId;
}

/** Endwerte des jüngsten Eintrags — der Cache `vehicle.lastCounters`. */
export function computeLastCounters(
  entry: Pick<FahrtenbuchEntry, 'counters'> | undefined,
): Record<string, number> {
  const result: Record<string, number> = {};
  if (!entry?.counters) return result;
  for (const [id, reading] of Object.entries(entry.counters)) {
    if (reading?.end !== undefined) result[id] = reading.end;
  }
  return result;
}

/** Die Felder des jüngsten Eintrags, die in den Fahrzeug-Cache wandern. */
export type VehicleCacheEntry = Pick<
  FahrtenbuchEntry,
  'counters' | 'abfahrt' | 'driverName' | 'defekt'
>;

/**
 * Der komplette Cache der jüngsten Fahrt am Fahrzeugdokument.
 *
 * Fahrer und Defekt-Hinweis stehen hier, weil die Fahrzeugübersicht sie sonst
 * aus dem geladenen Eintragsfenster ableiten müsste — ein Fahrzeug, dessen
 * letzte Fahrt älter als die jüngsten 50 Fahrten der Gruppe ist, hätte dann
 * still keinen Defekt-Hinweis mehr angezeigt.
 *
 * Alle Felder werden immer gesetzt, nie weggelassen: das Schreiben passiert mit
 * `merge: true`, ein fehlendes Feld würde also den alten Wert stehen lassen.
 */
export interface VehicleCache {
  lastCounters: Record<string, number>;
  lastEntryAt: string | null;
  lastDriverName: string | null;
  lastEntryHasDefect: boolean;
}

export function computeVehicleCache(
  entry: VehicleCacheEntry | undefined,
): VehicleCache {
  return {
    lastCounters: computeLastCounters(entry),
    lastEntryAt: entry?.abfahrt ?? null,
    lastDriverName: entry?.driverName?.trim() || null,
    lastEntryHasDefect: entry?.defekt === true,
  };
}
