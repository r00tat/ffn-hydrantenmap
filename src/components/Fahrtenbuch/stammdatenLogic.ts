import {
  FUEL_TYPES,
  normalizeName,
  suggestPresetForVehicleName,
  VEHICLE_PRESETS,
  type CounterChangeWarning,
  type CounterDefinition,
  type CounterMode,
  type FahrtenbuchPerson,
  type FahrtenbuchVehicle,
  type FuelType,
  type VehiclePresetId,
} from '../../common/fahrtenbuch';

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

export interface RecipientRecord {
  id: string;
  name: string;
}

export interface PersonSyncPlan {
  create: { name: string; blaulichtSmsRecipientId: string }[];
  link: { personId: string; blaulichtSmsRecipientId: string }[];
  ambiguous: { blaulichtSmsRecipientId: string; name: string }[];
}

/**
 * Plant den Personen-Abgleich mit der BlaulichtSMS-Empfängerliste. Mehrdeutige
 * Namenstreffer werden gemeldet statt geraten: mehrere gleichnamige Personen,
 * mehrere gleichnamige Empfänger für dieselbe Person und Personen, die bereits
 * auf eine andere Empfänger-ID zeigen (in BlaulichtSMS gelöscht und mit neuer
 * ID neu angelegt). Der Admin kann die ID im Personen-Dialog umhängen — eine
 * zweite gleichnamige Person wäre im Fahrer-Dropdown nicht unterscheidbar.
 */
export function planPersonSync(
  recipients: RecipientRecord[],
  existing: FahrtenbuchPerson[],
): PersonSyncPlan {
  const plan: PersonSyncPlan = { create: [], link: [], ambiguous: [] };
  const linkedIds = new Set(
    existing.map((p) => p.blaulichtSmsRecipientId).filter(Boolean) as string[],
  );
  /** In diesem Lauf bereits verplante Personen — jede nur einmal verknüpfen. */
  const claimedPersonIds = new Set<string>();

  const reportAmbiguous = (recipient: RecipientRecord) =>
    plan.ambiguous.push({
      blaulichtSmsRecipientId: recipient.id,
      name: recipient.name,
    });

  for (const recipient of recipients) {
    if (linkedIds.has(recipient.id)) continue;

    const normalized = normalizeName(recipient.name);
    const sameName = existing.filter((p) => normalizeName(p.name) === normalized);
    const unlinked = sameName.filter((p) => !p.blaulichtSmsRecipientId);
    const free = unlinked.filter((p) => !claimedPersonIds.has(p.id as string));

    if (unlinked.length > 1 || (unlinked.length === 1 && free.length === 0)) {
      reportAmbiguous(recipient);
      continue;
    }
    if (free.length === 1) {
      claimedPersonIds.add(free[0].id as string);
      plan.link.push({
        personId: free[0].id as string,
        blaulichtSmsRecipientId: recipient.id,
      });
      continue;
    }
    // Kein freier Namenstreffer: Zeigt eine gleichnamige Person auf eine andere
    // Empfänger-ID, ist das eine Neuanlage in BlaulichtSMS — nicht duplizieren.
    if (sameName.length > 0) {
      reportAmbiguous(recipient);
      continue;
    }
    plan.create.push({
      name: recipient.name,
      blaulichtSmsRecipientId: recipient.id,
    });
  }

  return plan;
}
