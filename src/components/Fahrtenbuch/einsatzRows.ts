import {
  findEntryForFirecallVehicle,
  matchVehicleByName,
  normalizeName,
  validateEntryInput,
  type CounterReading,
  type FahrtenbuchEntry,
  type FahrtenbuchPerson,
  type FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import { parseTimestamp } from '../../common/time-format';

export interface EinsatzFzgItem {
  id: string;
  name?: string;
  alarmierung?: string;
  abruecken?: string;
}

export interface EinsatzCrewMember {
  recipientId?: string;
  name: string;
  /** Referenz auf das Fzg-Item der Karte. */
  vehicleId?: string | null;
  vehicleName?: string;
  funktion?: string;
}

export interface EinsatzFirecall {
  id: string;
  name: string;
  /** Alarmierungszeitpunkt des Einsatzes — auf Einsatzebene ist das `date`. */
  date?: string;
  abruecken?: string;
}

export interface EinsatzRowSource {
  fzgItems: EinsatzFzgItem[];
  crew: EinsatzCrewMember[];
  vehicles: FahrtenbuchVehicle[];
  persons: FahrtenbuchPerson[];
  entries: FahrtenbuchEntry[];
  firecall: EinsatzFirecall;
  now: string;
}

export interface EinsatzRow {
  /** Stabiler Schlüssel für React — die ID des Fzg-Items bzw. des Crew-Fahrzeugs. */
  key: string;
  /** Fahrzeugname aus der Einsatzquelle, auch ohne Stammdaten-Treffer. */
  sourceName: string;
  vehicleId?: string;
  vehicleName: string;
  driverId?: string;
  driverName: string;
  abfahrt: string;
  ankunft: string;
  counters: Record<string, CounterReading>;
  existingEntry?: FahrtenbuchEntry;
}

/**
 * Der Maschinist des Fahrzeugs, aufgelöst auf eine Person der Gruppe. Die
 * BlaulichtSMS-Empfänger-ID hat Vorrang vor dem Namen — sie ist stabil, der
 * Name wird in beiden Systemen unterschiedlich geschrieben. Bleibt auch der
 * Namensvergleich ohne eindeutigen Treffer, wird der Crew-Name als Freitext
 * übernommen; das Fahrtenbuch erlaubt Fahrer ohne Personendatensatz.
 */
function resolveDriver(
  crew: EinsatzCrewMember[],
  persons: FahrtenbuchPerson[],
  itemId: string,
): { driverId?: string; driverName: string } {
  const maschinist = crew.find(
    (c) => c.vehicleId === itemId && c.funktion === 'Maschinist',
  );
  if (!maschinist) return { driverName: '' };

  const byRecipient = maschinist.recipientId
    ? persons.find(
        (p) => p.blaulichtSmsRecipientId === maschinist.recipientId,
      )
    : undefined;
  if (byRecipient) {
    return { driverId: byRecipient.id, driverName: byRecipient.name };
  }

  const normalized = normalizeName(maschinist.name);
  const byName = normalized
    ? persons.filter((p) => normalizeName(p.name) === normalized)
    : [];
  // Nur ein eindeutiger Treffer wird verknüpft — bei Namensgleichheit bliebe
  // sonst offen, welche Person gefahren ist.
  if (byName.length === 1) {
    return { driverId: byName[0].id, driverName: byName[0].name };
  }

  return { driverName: maschinist.name };
}

/**
 * Startwerte aus dem Zähler-Cache des Fahrzeugs. Nur `startEnd`-Zähler haben
 * einen Startwert; ein `reading`-Zähler wird erst bei der Rückkehr abgelesen.
 */
export function startCounters(
  vehicle?: FahrtenbuchVehicle,
): Record<string, CounterReading> {
  const counters: Record<string, CounterReading> = {};
  for (const def of vehicle?.counters ?? []) {
    if (def.mode !== 'startEnd') continue;
    const start = vehicle?.lastCounters?.[def.id];
    if (start !== undefined) counters[def.id] = { start };
  }
  return counters;
}

/**
 * Der erste lesbare Zeitstempel als ISO-8601. Die Zeiten der Fzg-Items sind
 * nicht einheitlich — der KI-Assistent schreibt `alarmierung` als reine
 * Uhrzeit ("10:05"), Importe liefern deutsches Datumsformat. `parseTimestamp`
 * kennt alle Varianten; ohne die Normalisierung stünde das Feld im Formular
 * leer und `Date.parse` in der Validierung meldete einen ungültigen Wert.
 */
function firstTimestamp(...candidates: (string | undefined)[]): string {
  for (const candidate of candidates) {
    const parsed = parseTimestamp(candidate);
    if (parsed) return parsed.toISOString();
  }
  return '';
}

/**
 * Baut die Zeilen der Sammelerfassung. Quelle sind die Fzg-Items der Karte,
 * ergänzt um Fahrzeuge, die nur über die Mannschaftszuordnung bekannt sind.
 */
export function buildEinsatzRows(source: EinsatzRowSource): EinsatzRow[] {
  const { fzgItems, crew, vehicles, persons, entries, firecall, now } = source;

  const items: EinsatzFzgItem[] = [...fzgItems];
  const knownIds = new Set(items.map((i) => i.id));
  for (const member of crew) {
    if (
      member.vehicleId &&
      !knownIds.has(member.vehicleId) &&
      member.vehicleName
    ) {
      knownIds.add(member.vehicleId);
      items.push({ id: member.vehicleId, name: member.vehicleName });
    }
  }

  return items.map((item) => {
    const groupVehicle = matchVehicleByName(vehicles, item.name ?? '');
    const { driverId, driverName } = resolveDriver(crew, persons, item.id);

    return {
      key: item.id,
      sourceName: item.name ?? '',
      vehicleId: groupVehicle?.id,
      vehicleName: groupVehicle?.name ?? item.name ?? '',
      driverId,
      driverName,
      // Auf Einsatzebene ist `date` der Alarmierungszeitpunkt; ein eigenes
      // Alarmierungsfeld gibt es dort nicht.
      abfahrt: firstTimestamp(item.alarmierung, firecall.date, now),
      ankunft: firstTimestamp(item.abruecken, firecall.abruecken, now),
      counters: startCounters(groupVehicle),
      existingEntry: groupVehicle?.id
        ? findEntryForFirecallVehicle(entries, firecall.id, groupVehicle.id)
        : undefined,
    };
  });
}

/** Eine übersprungene Zeile samt der Fehlerschlüssel, die sie blockieren. */
export interface EinsatzRowIssue {
  row: EinsatzRow;
  errors: string[];
}

export interface EinsatzRowPartition {
  /** Vollständig und speicherbar. */
  ready: EinsatzRow[];
  /** Fahrzeug zugeordnet, aber Pflichtangaben fehlen — wird gemeldet. */
  incomplete: EinsatzRowIssue[];
  /** Kein Gruppenfahrzeug zugeordnet — wird gemeldet. */
  unassigned: EinsatzRow[];
  /**
   * Für dieses Fahrzeug wird zu diesem Einsatz nichts (mehr) geschrieben:
   * entweder existiert bereits ein Eintrag, oder eine frühere Zeile desselben
   * Durchlaufs deckt dasselbe Fahrzeug ab.
   */
  existing: EinsatzRow[];
}

/**
 * Teilt die Zeilen vor dem Speichern auf. Die Sammelerfassung schreibt in
 * einem Firestore-Batch: eine einzige ungültige Zeile ließe sonst den ganzen
 * Batch scheitern. Übersprungene Zeilen bleiben stehen und werden gemeldet.
 *
 * Dasselbe Fahrzeug kann mehrfach auftauchen — etwa als automatisch angelegtes
 * und als von Hand gesetztes Fzg-Item oder nach manueller Zuordnung zweier
 * Zeilen auf dasselbe Fahrzeug. Es wird trotzdem nur einmal geschrieben.
 */
export function partitionEinsatzRows(
  rows: EinsatzRow[],
  vehicles: FahrtenbuchVehicle[],
  ziel: string,
): EinsatzRowPartition {
  const partition: EinsatzRowPartition = {
    ready: [],
    incomplete: [],
    unassigned: [],
    existing: [],
  };
  const covered = new Set<string>();

  for (const row of rows) {
    if (!row.vehicleId) {
      partition.unassigned.push(row);
      continue;
    }
    if (row.existingEntry || covered.has(row.vehicleId)) {
      covered.add(row.vehicleId);
      partition.existing.push(row);
      continue;
    }

    const vehicle = vehicles.find((v) => v.id === row.vehicleId);
    const errors = validateEntryInput(vehicle?.counters ?? [], {
      vehicleId: row.vehicleId,
      driverName: row.driverName,
      zweck: 'einsatz',
      ziel,
      abfahrt: row.abfahrt,
      ankunft: row.ankunft,
      counters: row.counters,
    });

    if (errors.length > 0) {
      partition.incomplete.push({ row, errors });
      continue;
    }
    covered.add(row.vehicleId);
    partition.ready.push(row);
  }

  return partition;
}

/**
 * Legt die Eingaben des Benutzers über die neu berechneten Zeilen. Ein
 * Firestore-Snapshot (etwa nach dem Speichern) berechnet die Zeilen neu;
 * ohne dieses Zusammenführen verlöre eine Zeile, die noch nicht gespeichert
 * werden konnte, ihre bereits getippten Werte. Felder, die niemand angefasst
 * hat, kommen weiter frisch aus den Quelldaten.
 *
 * `existingEntry` wird dabei immer neu bestimmt — sonst umginge eine von Hand
 * zugeordnete Zeile die Duplikatserkennung.
 */
export function mergeRowEdits(
  rows: EinsatzRow[],
  edits: Record<string, Partial<EinsatzRow>>,
  entries: FahrtenbuchEntry[],
  firecallId: string,
): EinsatzRow[] {
  return rows.map((row) => {
    const edit = edits[row.key];
    if (!edit) return row;
    const merged = { ...row, ...edit };
    merged.existingEntry = merged.vehicleId
      ? findEntryForFirecallVehicle(entries, firecallId, merged.vehicleId)
      : undefined;
    return merged;
  });
}
