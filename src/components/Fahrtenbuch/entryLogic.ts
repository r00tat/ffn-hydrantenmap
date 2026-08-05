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
 * aus einer Route. Ausschließlich mit serverseitig berechneten Werten zu
 * befüllen, nie mit Daten aus dem Request — die Trennung von
 * `FahrtenbuchEntryInput` schützt heute nur über die Aufrufer, nicht über den
 * Typ selbst.
 *
 * Enthält `counterSources` den Wert `'route'`, muss `routeDistanceMeters`
 * gesetzt sein: Sonst behauptete das Dokument, ein Stand sei aus einer Route
 * berechnet, ohne die Route nachprüfbar mitzuliefern.
 */
export interface EntryDerivation {
  counterSources?: Record<string, CounterSource>;
  routeDistanceMeters?: number;
}

export interface BuildEntryOptions {
  /** Serverseitig abgeleitete Werte — siehe `EntryDerivation`. */
  derivation?: EntryDerivation;
  /**
   * Fehlende Zählerstände nicht als Fehler behandeln. Setzt nur die
   * Sammelerfassung aus dem Einsatz; die Begründung steht an
   * `ValidateEntryOptions.countersOptional`.
   */
  countersOptional?: boolean;
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
  options?: BuildEntryOptions,
): FahrtenbuchEntry {
  const derivation = options?.derivation;
  // Die Invariante von `EntryDerivation` strukturell abgesichert, statt sie
  // nur zu dokumentieren: Ein Dokument darf nicht behaupten, ein Stand sei aus
  // einer Route berechnet, ohne die Route mitzuliefern. Die Aufrufer fangen
  // Ausnahmen je Eintrag ab — die betroffene Zeile fällt aus, der Rest nicht.
  //
  // Gilt nur für `'route'`: Eine Schätzung hat keine Route, die sie belegen
  // könnte — sie kennzeichnet sich über `'estimate'` selbst als geschätzt.
  if (
    derivation?.routeDistanceMeters === undefined &&
    Object.values(derivation?.counterSources ?? {}).includes('route')
  ) {
    throw new Error(
      'fahrtenbuch derivation: counter source route without routeDistanceMeters',
    );
  }

  const definitions: CounterDefinition[] = vehicle.counters ?? [];
  const errors = validateEntryInput(
    definitions,
    {
      vehicleId: input.vehicleId,
      driverName: input.driverName,
      zweck: input.zweck,
      ziel: input.ziel,
      abfahrt: input.abfahrt,
      ankunft: input.ankunft,
      counters: input.counters ?? {},
    },
    { countersOptional: options?.countersOptional },
  );
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

  // Nur Zähler übernehmen, die im Dokument tatsächlich vorkommen — sonst
  // entstünde eine Herkunftsangabe für einen Zähler, den `doc.counters` gar
  // nicht enthält (etwa nach einem Fahrzeugwechsel auf eines ohne
  // Kilometerzähler).
  const counterSources = Object.fromEntries(
    Object.entries(derivation?.counterSources ?? {}).filter(
      ([id]) => id in doc.counters,
    ),
  );
  // Ein leeres Objekt wird weggelassen, damit ein von Hand erfasster Eintrag
  // nicht so aussieht, als sei etwas abgeleitet worden.
  if (Object.keys(counterSources).length > 0) {
    doc.counterSources = counterSources;
  }
  // Die Distanz wird auch dann geschrieben, wenn kein Zähler als abgeleitet
  // gilt: Sie ist dann Kontext zum Einsatz, keine Behauptung über die
  // Herkunft eines bestimmten Zählers.
  if (derivation?.routeDistanceMeters !== undefined) {
    doc.routeDistanceMeters = derivation.routeDistanceMeters;
  }

  return doc;
}

/**
 * Die Herkunftsangaben, die eine Bearbeitung überdauern. Ein geänderter
 * Zählerstand ist eine Ablesung und keine Ableitung mehr; ein unveränderter
 * behält seine Herkunft — sonst löschte schon eine Korrektur der Hinweise
 * (`hinweise`, `defekt`, …) den Nachweis für einen Zähler, den niemand
 * angefasst hat.
 *
 * Verglichen werden Start *und* Ende: Die Ableitung lautet „Startstand plus
 * Gesamtstrecke". Bliebe die Herkunft bei bloß korrigiertem Startstand
 * erhalten, behauptete der Eintrag eine Ableitung, der seine eigene Differenz
 * widerspricht.
 */
export function survivingCounterSources(
  previous: Record<string, CounterSource> | undefined,
  previousCounters: Record<string, CounterReading>,
  nextCounters: Record<string, CounterReading>,
): Record<string, CounterSource> {
  const result: Record<string, CounterSource> = {};
  for (const [id, source] of Object.entries(previous ?? {})) {
    if (
      previousCounters[id]?.end === nextCounters[id]?.end &&
      previousCounters[id]?.start === nextCounters[id]?.start
    ) {
      result[id] = source;
    }
  }
  return result;
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
