// Subcollections unter groups/{groupId}
export const FAHRTENBUCH_PERSON_COLLECTION_ID = 'person';
export const FAHRTENBUCH_VEHICLE_COLLECTION_ID = 'vehicle';
export const FAHRTENBUCH_COLLECTION_ID = 'fahrtenbuch';

export type CounterMode = 'startEnd' | 'reading';
export type CounterChangeWarning = 'decrease' | 'anyChange' | 'none';

export type FuelType = 'diesel' | 'benzin' | 'adblue';
export const FUEL_TYPES: FuelType[] = ['diesel', 'benzin', 'adblue'];

export type FahrtZweck = 'einsatz' | 'uebung' | 'versorgung' | 'sonstiges';
export const FAHRT_ZWECKE: FahrtZweck[] = [
  'einsatz',
  'uebung',
  'versorgung',
  'sonstiges',
];

export interface CounterDefinition {
  id: string;
  /** Klartext, immer gesetzt — Anzeige-Fallback */
  label: string;
  /** Nur bei Preset-Zählern gesetzt, hat Vorrang: t(labelKey) */
  labelKey?: string;
  unit: string;
  mode: CounterMode;
  changeWarning: CounterChangeWarning;
  required: boolean;
}

export interface CounterReading {
  /** nur bei mode 'startEnd' */
  start?: number;
  /** Stand bei Rückkehr; bei mode 'reading' der einzige Wert */
  end?: number;
  /** nur bei mode 'startEnd', = end - start */
  diff?: number;
}

/**
 * Herkunft eines abgeleiteten Endstands: `'route'` heißt aus der
 * Routendistanz berechnet, `'unchanged'` heißt unverändert übernommen — bei
 * Start/Ende-Zählern aus dem Startstand dieser Fahrt, bei Ablesezählern aus
 * dem letzten bekannten Stand. Steht hier und nicht in
 * `fahrtenbuchAutoFill.ts`: Bliebe der Typ dort, müsste dieses Basismodul von
 * seinem eigenen Konsumenten importieren.
 */
export type CounterSource = 'route' | 'unchanged';

export interface FahrtenbuchPerson {
  id?: string;
  name: string;
  active: boolean;
  blaulichtSmsRecipientId?: string;
  userId?: string;
  /** Aus dem BlaulichtSMS-CSV-Export übernommen, im Dialog korrigierbar. */
  phone?: string;
  email?: string;
  note?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface FahrtenbuchVehicle {
  id?: string;
  name: string;
  kennzeichen?: string;
  active: boolean;
  counters: CounterDefinition[];
  fuelTypes: FuelType[];
  kostenersatzVehicleId?: string;
  sortOrder?: number;
  /**
   * Cache der jüngsten Fahrt dieses Fahrzeugs. Serverseitig nach jedem Create,
   * Update und Delete neu geschrieben (`refreshVehicleCounters`), damit die
   * Fahrzeugübersicht nicht auf ein Zeitfenster geladener Einträge angewiesen
   * ist. `null` heißt „keine Fahrt vorhanden", `undefined` „Cache stammt aus
   * der Zeit vor diesem Feld".
   */
  /** je Zähler der letzte erfasste Endwert */
  lastCounters?: Record<string, number>;
  lastEntryAt?: string | null;
  /** Fahrer der jüngsten Fahrt */
  lastDriverName?: string | null;
  /** Die jüngste Fahrt meldet einen Defekt — sicherheitsrelevanter Hinweis. */
  lastEntryHasDefect?: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface FahrtenbuchEntry {
  id?: string;
  vehicleId: string;
  vehicleName: string;
  driverId?: string;
  driverName: string;
  zweck: FahrtZweck;
  firecallId?: string;
  firecallName?: string;
  ziel: string;
  /** ISO-Zeitstempel */
  abfahrt: string;
  /** ISO-Zeitstempel */
  ankunft: string;
  counters: Record<string, CounterReading>;
  /**
   * Zähler, deren Endstand abgeleitet und nicht abgelesen wurde. Ein
   * Fahrtenbuch ist ein Nachweisdokument — ohne dieses Feld wäre später nicht
   * mehr erkennbar, welche Stände berechnet und welche abgelesen wurden.
   */
  counterSources?: Record<string, CounterSource>;
  /** Einfache Routendistanz in Metern, Grundlage des Kilometer-Endstands. */
  routeDistanceMeters?: number;
  betriebsmittel?: Partial<Record<FuelType, number>>;
  hinweise?: string;
  defekt?: boolean;
  group: string;
  deleted: boolean;
  createdAt: string;
  createdBy: string;
  createdByName: string;
  updatedAt: string;
  updatedBy: string;
}

export type VehiclePresetId = 'fahrzeug' | 'boot' | 'none';

export const VEHICLE_PRESETS: Record<VehiclePresetId, CounterDefinition[]> = {
  fahrzeug: [
    {
      id: 'km',
      label: 'Kilometerstand',
      labelKey: 'counters.km',
      unit: 'km',
      mode: 'startEnd',
      changeWarning: 'decrease',
      required: true,
    },
  ],
  boot: [
    {
      id: 'betriebsstundenBb',
      label: 'Betriebsstunden Backbordmotor',
      labelKey: 'counters.betriebsstundenBb',
      unit: 'h',
      mode: 'startEnd',
      changeWarning: 'decrease',
      required: true,
    },
    {
      id: 'lenzpumpeStb',
      label: 'Lenzpumpe Steuerbord',
      labelKey: 'counters.lenzpumpeStb',
      unit: 'h',
      mode: 'reading',
      changeWarning: 'anyChange',
      required: true,
    },
    {
      id: 'lenzpumpeBb',
      label: 'Lenzpumpe Backbord',
      labelKey: 'counters.lenzpumpeBb',
      unit: 'h',
      mode: 'reading',
      changeWarning: 'anyChange',
      required: true,
    },
  ],
  none: [],
};

export interface CounterWarning {
  counterId: string;
  type: 'decrease' | 'changed';
  lastValue: number;
  value: number;
}

export interface EntryInput {
  vehicleId: string;
  driverName: string;
  /** Muss einer der Werte aus `FAHRT_ZWECKE` sein. */
  zweck: string;
  ziel: string;
  abfahrt: string;
  ankunft: string;
  counters: Record<string, CounterReading>;
}

/** Füllt `diff` für Zähler im Modus startEnd und verwirft unbekannte Zähler. */
export function applyCounterDiffs(
  definitions: CounterDefinition[],
  counters: Record<string, CounterReading>,
): Record<string, CounterReading> {
  const result: Record<string, CounterReading> = {};
  for (const def of definitions) {
    const reading = counters[def.id];
    if (!reading) continue;
    if (def.mode === 'reading') {
      result[def.id] = reading.end === undefined ? {} : { end: reading.end };
      continue;
    }
    const { start, end } = reading;
    const partial: CounterReading = {};
    if (start !== undefined) partial.start = start;
    if (end !== undefined) partial.end = end;
    if (start !== undefined && end !== undefined) partial.diff = end - start;
    result[def.id] = partial;
  }
  return result;
}

/**
 * Warnungen gegen die zuletzt bekannten Zählerstände des Fahrzeugs. Warnungen
 * blockieren das Speichern nicht.
 */
export function counterWarnings(
  definitions: CounterDefinition[],
  counters: Record<string, CounterReading>,
  lastCounters: Record<string, number> = {},
): CounterWarning[] {
  const warnings: CounterWarning[] = [];
  for (const def of definitions) {
    if (def.changeWarning === 'none') continue;
    const lastValue = lastCounters[def.id];
    if (lastValue === undefined) continue;
    const reading = counters[def.id];
    if (!reading) continue;

    if (def.changeWarning === 'decrease') {
      const value = def.mode === 'reading' ? reading.end : reading.start;
      if (value !== undefined && value < lastValue) {
        warnings.push({ counterId: def.id, type: 'decrease', lastValue, value });
      }
      continue;
    }

    const value = reading.end;
    if (value !== undefined && value !== lastValue) {
      warnings.push({ counterId: def.id, type: 'changed', lastValue, value });
    }
  }
  return warnings;
}

/**
 * Harte Validierung. Liefert eine Liste von Fehlerschlüsseln; leer heißt gültig.
 * Zählerbezogene Fehler tragen die Zähler-ID nach einem Doppelpunkt.
 */
export function validateEntryInput(
  definitions: CounterDefinition[],
  input: EntryInput,
): string[] {
  const errors: string[] = [];

  if (!input.vehicleId?.trim()) errors.push('vehicleMissing');
  if (!input.driverName?.trim()) errors.push('driverMissing');
  if (!FAHRT_ZWECKE.includes(input.zweck as FahrtZweck)) {
    errors.push('zweckInvalid');
  }

  const abfahrt = Date.parse(input.abfahrt);
  const ankunft = Date.parse(input.ankunft);
  if (Number.isNaN(abfahrt)) errors.push('abfahrtInvalid');
  if (Number.isNaN(ankunft)) errors.push('ankunftInvalid');
  if (!Number.isNaN(abfahrt) && !Number.isNaN(ankunft) && ankunft < abfahrt) {
    errors.push('ankunftBeforeAbfahrt');
  }

  for (const def of definitions) {
    const reading = input.counters[def.id];
    const hasEnd = reading?.end !== undefined;
    const hasStart = reading?.start !== undefined;

    if (def.required) {
      if (!hasEnd || (def.mode === 'startEnd' && !hasStart)) {
        errors.push(`counterMissing:${def.id}`);
        continue;
      }
    }
    if (def.mode === 'startEnd' && hasStart && hasEnd && reading!.end! < reading!.start!) {
      errors.push(`counterEndBeforeStart:${def.id}`);
    }
  }

  return errors;
}

/** Zeitangabe ohne Datum, etwa „10:05" — im Einsatz die Regel. */
export function isTimeOnlyTimestamp(value?: string): boolean {
  return !!value && /^\d{1,2}:\d{2}(:\d{2})?$/.test(value.trim());
}

/** Uhrzeit der Referenz auf dem Kalendertag der Abfahrt. */
function onDepartureDay(departure: Date, reference: Date): Date {
  const result = new Date(departure);
  result.setHours(reference.getHours(), reference.getMinutes(), 0, 0);
  return result;
}

/**
 * Uhrzeit auf dem Kalendertag des Ankers, ohne weitere Regel. Für eine
 * Alarmierung wie „19:00", die auf den Einsatztag gehört.
 */
export function timeOnSameDay(anchor: string, time: Date): string {
  const day = new Date(anchor);
  if (Number.isNaN(day.getTime())) return time.toISOString();
  return onDepartureDay(day, time).toISOString();
}

/**
 * Vorschlag für die Ankunft: Kalendertag der Abfahrt, Uhrzeit der Referenz
 * (im Regelfall „jetzt"). Fahrten dauern normalerweise keinen Kalendertag,
 * deshalb bleibt der Vorschlag am Tag der Abfahrt; läge die Referenzzeit davor,
 * wird auf die Abfahrt geklemmt statt auf den nächsten Tag zu rollen. Eine
 * Fahrt über Mitternacht trägt der Benutzer selbst ein — sonst stünden bei
 * einem Einsatz von gestern Abend Abfahrt und Ankunft einen Tag auseinander.
 *
 * Dient auch dem Nachziehen: ändert der Benutzer die Abfahrt, wandert die
 * Ankunft mit dem Datum mit und behält ihre Uhrzeit.
 */
export function arrivalOnDepartureDay(
  abfahrt: string,
  reference: Date = new Date(),
): string {
  const departure = new Date(abfahrt);
  if (Number.isNaN(departure.getTime())) return reference.toISOString();
  const result = onDepartureDay(departure, reference);
  return (
    result.getTime() < departure.getTime() ? departure : result
  ).toISOString();
}

/**
 * Ankunft aus einer eingetragenen Uhrzeit ohne Datum. Anders als beim Vorschlag
 * ist die Uhrzeit hier gewollt: „01:30" nach einer Abfahrt um 23:50 kann nur der
 * nächste Morgen sein, deshalb wird hier auf den nächsten Tag gerollt.
 */
export function arrivalFromTimeOnly(abfahrt: string, time: Date): string {
  const departure = new Date(abfahrt);
  if (Number.isNaN(departure.getTime())) return time.toISOString();
  const result = onDepartureDay(departure, time);
  if (result.getTime() < departure.getTime()) {
    result.setDate(result.getDate() + 1);
  }
  return result.toISOString();
}

export function normalizeName(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function matchVehicleByName(
  vehicles: FahrtenbuchVehicle[],
  name: string,
): FahrtenbuchVehicle | undefined {
  const normalized = normalizeName(name);
  if (!normalized) return undefined;
  return vehicles.find((v) => normalizeName(v.name) === normalized);
}

export function findEntryForFirecallVehicle(
  entries: FahrtenbuchEntry[],
  firecallId: string,
  vehicleId: string,
): FahrtenbuchEntry | undefined {
  return entries.find(
    (e) => !e.deleted && e.firecallId === firecallId && e.vehicleId === vehicleId,
  );
}

export function suggestPresetForVehicleName(name: string): VehiclePresetId {
  const normalized = normalizeName(name);
  if (normalized === 'mzb' || normalized.includes('mehrzweckboot')) return 'boot';
  if (normalized.includes('anhänger') || normalized.startsWith('wla')) return 'none';
  return 'fahrzeug';
}

/**
 * Zählerstände für die Warnlogik: beim Anlegen der Cache des Fahrzeugs, beim
 * Bearbeiten die Endwerte des chronologischen Vorgängers. `entries` ist
 * absteigend nach `abfahrt` sortiert.
 */
export function referenceCounters(
  entries: FahrtenbuchEntry[],
  vehicleId: string,
  vehicleLastCounters: Record<string, number> = {},
  editedEntryId?: string,
): Record<string, number> {
  if (!editedEntryId) return vehicleLastCounters;

  const ofVehicle = entries.filter((e) => !e.deleted && e.vehicleId === vehicleId);
  const index = ofVehicle.findIndex((e) => e.id === editedEntryId);
  const predecessor = index >= 0 ? ofVehicle[index + 1] : undefined;

  const result: Record<string, number> = {};
  for (const [id, reading] of Object.entries(predecessor?.counters ?? {})) {
    if (reading?.end !== undefined) result[id] = reading.end;
  }
  return result;
}
