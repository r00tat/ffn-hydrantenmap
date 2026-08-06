import {
  FAHRTENBUCH_MANGEL_EMAILS_MAX,
  FUEL_TYPES,
  normalizeName,
  suggestPresetForVehicleName,
  VEHICLE_PRESETS,
  type CounterChangeWarning,
  type CounterDefinition,
  type CounterMode,
  type FahrtenbuchVehicle,
  type FuelType,
  type VehiclePresetId,
} from '../../common/fahrtenbuch';
import type { GeoPositionObject } from '../../common/geo';
import { isValidEmail } from '../../common/kostenersatzEmail';

const COUNTER_MODES: CounterMode[] = ['startEnd', 'reading'];
const COUNTER_CHANGE_WARNINGS: CounterChangeWarning[] = [
  'decrease',
  'anyChange',
  'none',
];

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * Zählerdefinitionen aus einer Server Action sind Client-Eingabe — der
 * `Pick<FahrtenbuchVehicle, …>`-Typ existiert zur Laufzeit nicht. Ein Zähler
 * ohne `id` oder mit unbekanntem `mode` würde dauerhaft im Fahrzeugdokument
 * landen und den Eintrags-Dialog für alle Benutzer unbrauchbar machen. Deshalb
 * bleiben nur die bekannten Felder mit gültigen Werten übrig.
 */
export function sanitizeCounterDefinitions(input: unknown): CounterDefinition[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();
  const result: CounterDefinition[] = [];

  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const record = raw as Record<string, unknown>;

    const id = optionalString(record.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const mode = record.mode as CounterMode;
    const changeWarning = record.changeWarning as CounterChangeWarning;
    const labelKey = optionalString(record.labelKey);

    const counter: CounterDefinition = {
      id,
      label: optionalString(record.label) ?? id,
      unit: optionalString(record.unit) ?? '',
      mode: COUNTER_MODES.includes(mode) ? mode : 'startEnd',
      changeWarning: COUNTER_CHANGE_WARNINGS.includes(changeWarning)
        ? changeWarning
        : 'none',
      required: record.required === true,
    };
    if (labelKey) counter.labelKey = labelKey;
    result.push(counter);
  }

  return result;
}

/** Nur bekannte Treibstoffarten, ohne Duplikate. */
export function sanitizeFuelTypes(input: unknown): FuelType[] {
  if (!Array.isArray(input)) return [];
  const result: FuelType[] = [];
  for (const value of input) {
    const fuel = value as FuelType;
    if (FUEL_TYPES.includes(fuel) && !result.includes(fuel)) result.push(fuel);
  }
  return result;
}

/**
 * Firestore sortiert Zeichenketten und Zahlen in getrennte Typbänder — ein
 * `sortOrder` als String würde die Fahrzeugliste umsortieren.
 */
export function sanitizeSortOrder(input: unknown): number {
  if (typeof input === 'number') return Number.isFinite(input) ? input : 0;
  if (typeof input === 'string' && input.trim()) {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export interface ImportSourceVehicle {
  id: string;
  name: string;
  sortOrder?: number;
}

export interface VehicleImportPlanRow {
  sourceId: string;
  name: string;
  sortOrder?: number;
  preset: VehiclePresetId;
  alreadyImported: boolean;
}

/**
 * Vorschau des Fahrzeug-Imports. Erkennt bereits importierte Fahrzeuge über die
 * Kostenersatz-ID und, falls die fehlt, über den normalisierten Namen.
 */
export function planVehicleImport(
  source: ImportSourceVehicle[],
  existing: FahrtenbuchVehicle[],
): VehicleImportPlanRow[] {
  const byKostenersatzId = new Set(
    existing.map((v) => v.kostenersatzVehicleId).filter(Boolean) as string[],
  );
  const byName = new Set(existing.map((v) => normalizeName(v.name)));

  return source.map((item) => ({
    sourceId: item.id,
    name: item.name,
    sortOrder: item.sortOrder,
    preset: suggestPresetForVehicleName(item.name),
    alreadyImported:
      byKostenersatzId.has(item.id) || byName.has(normalizeName(item.name)),
  }));
}

export interface VehicleImportSelectionEntry {
  sourceId: string;
  preset: VehiclePresetId;
}

export interface VehicleImportCreateRow {
  sourceId: string;
  name: string;
  sortOrder?: number;
  preset: VehiclePresetId;
}

export interface ResolvedVehicleImport {
  create: VehicleImportCreateRow[];
  /** Vom Admin ausgewählt, aber nicht importierbar. */
  skipped: number;
}

/**
 * Löst die Auswahl des Import-Dialogs gegen die Vorschau auf. Gezählt wird aus
 * Sicht des Admins: `create` ist, was tatsächlich angelegt wird, `skipped` alles
 * Ausgewählte, das nicht angelegt werden kann — bereits importiert, keine
 * passende Quellzeile, unbekanntes Preset oder ein Namensduplikat innerhalb
 * desselben Laufs. Nicht Ausgewähltes wird gar nicht gezählt.
 */
export function resolveVehicleImportSelection(
  rows: VehicleImportPlanRow[],
  selection: VehicleImportSelectionEntry[],
): ResolvedVehicleImport {
  const rowsBySourceId = new Map(rows.map((row) => [row.sourceId, row]));
  const handled = new Set<string>();
  const plannedNames = new Set<string>();
  const create: VehicleImportCreateRow[] = [];
  let skipped = 0;

  for (const entry of selection) {
    if (handled.has(entry.sourceId)) continue;
    handled.add(entry.sourceId);

    const row = rowsBySourceId.get(entry.sourceId);
    const normalized = row ? normalizeName(row.name) : '';
    if (
      !row ||
      row.alreadyImported ||
      !Object.prototype.hasOwnProperty.call(VEHICLE_PRESETS, entry.preset) ||
      plannedNames.has(normalized)
    ) {
      skipped += 1;
      continue;
    }

    plannedNames.add(normalized);
    create.push({
      sourceId: row.sourceId,
      name: row.name,
      sortOrder: row.sortOrder,
      preset: entry.preset,
    });
  }

  return { create, skipped };
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/**
 * Prüft die eingegebenen Koordinaten. Ein ungültiger Wert wird verworfen,
 * statt gespeichert zu werden — ein Standort irgendwo im Nirgendwo würde
 * stillschweigend falsche Kilometer liefern.
 *
 * `input` ist Client-Eingabe der Server Action, der Typ existiert zur
 * Laufzeit nicht (siehe `sanitizeCounterDefinitions`). Numerische
 * Zeichenketten werden wie bei `sanitizeSortOrder` angenommen.
 */
export function sanitizeStandort(input: unknown): GeoPositionObject | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const record = input as Record<string, unknown>;

  const lat = toFiniteNumber(record.lat);
  const lng = toFiniteNumber(record.lng);
  if (lat === undefined || lng === undefined) return undefined;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return undefined;

  // Null Island: (0,0) ist exakt der Wert, den ein genulltes oder leeres
  // Formularfeld liefert (vgl. `latLngPosition()` in `common/geo.ts`, das aus
  // demselben Grund `lat || default` nutzt) — das „Nirgendwo“, vor dem der
  // Kommentar oben warnt. `lat === 0` allein ist kein Warnsignal, der Äquator
  // ist eine gültige Breite.
  if (lat === 0 && lng === 0) return undefined;

  return { lat, lng };
}

export interface MangelEmailsResult {
  emails: string[];
  /** Fehlerschlüssel, sobald die Eingabe nicht vollständig brauchbar ist. */
  error?: 'emailInvalid' | 'tooManyEmails';
}

/**
 * Prüft die Empfängerliste der Mangel-Benachrichtigung.
 *
 * Anders als bei den Zählerdefinitionen wird hier **nicht** still verworfen:
 * Wer eine Adresse vertippt, bekommt eine Meldung. Eine stillschweigend
 * weggelassene Adresse sähe im Formular nach dem Neuladen wie „nie
 * eingetragen" aus, und ein Mangel ginge monatelang an niemanden — auffallen
 * würde das erst, wenn ihn jemand vermisst.
 *
 * Die leere Liste ist ausdrücklich gültig: Sie ist die Abschaltung.
 */
export function sanitizeMangelEmails(input: unknown): MangelEmailsResult {
  // Server-Action-Argumente sind Client-Eingabe — `string[]` existiert zur
  // Laufzeit nicht.
  if (!Array.isArray(input)) return { emails: [] };

  const emails: string[] = [];
  for (const value of input) {
    if (typeof value !== 'string') return { emails: [], error: 'emailInvalid' };
    const trimmed = value.trim();
    // Leere Felder sind kein Fehler, sondern das, was ein Formular liefert,
    // in dem jemand einen Eintrag geleert hat.
    if (!trimmed) continue;
    if (!isValidEmail(trimmed)) return { emails: [], error: 'emailInvalid' };
    // Dieselbe Adresse zweimal bekäme die Mail zweimal.
    if (!emails.includes(trimmed)) emails.push(trimmed);
  }

  if (emails.length > FAHRTENBUCH_MANGEL_EMAILS_MAX) {
    return { emails: [], error: 'tooManyEmails' };
  }
  return { emails };
}
