import {
  arrivalFromTimeOnly,
  arrivalOnDepartureDay,
  findEntryForFirecallVehicle,
  isTimeOnlyTimestamp,
  matchVehicleByName,
  normalizeName,
  timeOnSameDay,
  validateEntryInput,
  type CounterDefinition,
  type CounterReading,
  type FahrtenbuchEntry,
  type FahrtenbuchPerson,
  type FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import {
  autoFillCounterEnds,
  isKmCounter,
  type RoundTripDistance,
} from '../../common/fahrtenbuchAutoFill';
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
    ? persons.find((p) => p.blaulichtSmsRecipientId === maschinist.recipientId)
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
function firstTimestamp(
  /**
   * Kalendertag für Angaben ohne Datum. Ohne diese Verankerung legt
   * `parseTimestamp` „19:00" auf **heute** — bei einem Einsatz von gestern
   * lägen Abfahrt und Ankunft dann einen Tag auseinander.
   */
  dayAnchor: string | undefined,
  candidates: (string | undefined)[],
): string {
  for (const candidate of candidates) {
    const parsed = parseTimestamp(candidate);
    if (!parsed) continue;
    return dayAnchor && isTimeOnlyTimestamp(candidate)
      ? timeOnSameDay(dayAnchor, parsed.toDate())
      : parsed.toISOString();
  }
  return '';
}

/**
 * Wie `firstTimestamp`, aber für die Ankunft: eine Uhrzeit ohne Datum, die vor
 * der Abfahrt liegt, ist der nächste Morgen („01:15" nach Abfahrt um 23:50).
 */
function firstArrival(
  abfahrt: string,
  candidates: (string | undefined)[],
): string {
  for (const candidate of candidates) {
    const parsed = parseTimestamp(candidate);
    if (!parsed) continue;
    return abfahrt && isTimeOnlyTimestamp(candidate)
      ? arrivalFromTimeOnly(abfahrt, parsed.toDate())
      : parsed.toISOString();
  }
  return '';
}

/** Abfahrt und Ankunft, die für alle Fahrzeuge des Einsatzes gelten. */
export interface EinsatzTimes {
  abfahrt: string;
  ankunft: string;
}

/**
 * Die gemeinsamen Zeiten des Einsatzes. Eine Zeit für alle statt einer je
 * Fahrzeug: Beim Befüllen aus dem Einsatz sind die Zeiten fast immer dieselben,
 * und ein Feldpaar je Fahrzeug bedeutete dieselbe Angabe fünfmal zu prüfen.
 *
 * Gewählt wird die **früheste** Alarmierung und das **späteste** Abrücken —
 * damit deckt die gemeinsame Spanne jede einzelne Fahrt ab. Der umgekehrte Fall
 * (späteste Abfahrt) würde für ein früher ausgerücktes Fahrzeug eine Abfahrt
 * behaupten, die nach seiner Ankunft liegt.
 */
export function einsatzTimes(
  fzgItems: EinsatzFzgItem[],
  firecall: EinsatzFirecall,
  now: string,
): EinsatzTimes {
  const abfahrt =
    earliest(
      fzgItems.map((item) => firstTimestamp(firecall.date, [item.alarmierung])),
    ) ?? firstTimestamp(firecall.date, [firecall.date, now]);

  const ankunft =
    latest([
      ...fzgItems.map((item) => firstArrival(abfahrt, [item.abruecken])),
      firstArrival(abfahrt, [firecall.abruecken]),
    ]) ?? arrivalOnDepartureDay(abfahrt, new Date(now));

  return { abfahrt, ankunft };
}

/** Der früheste nicht-leere Zeitstempel, oder `undefined`. */
function earliest(candidates: string[]): string | undefined {
  return pickByTime(candidates, (value, best) => value < best);
}

/** Der späteste nicht-leere Zeitstempel, oder `undefined`. */
function latest(candidates: string[]): string | undefined {
  return pickByTime(candidates, (value, best) => value > best);
}

function pickByTime(
  candidates: string[],
  better: (value: number, best: number) => boolean,
): string | undefined {
  let result: string | undefined;
  let bestTime = 0;
  for (const candidate of candidates) {
    const time = Date.parse(candidate);
    if (Number.isNaN(time)) continue;
    if (result === undefined || better(time, bestTime)) {
      result = candidate;
      bestTime = time;
    }
  }
  return result;
}

/**
 * Baut die Zeilen der Sammelerfassung. Quelle sind die Fzg-Items der Karte,
 * ergänzt um Fahrzeuge, die nur über die Mannschaftszuordnung bekannt sind.
 *
 * Die Zeiten kommen für alle Zeilen aus `times` — dem Kopfblock der
 * Sammelerfassung. Wer für ein einzelnes Fahrzeug abweichende Zeiten braucht,
 * überschreibt sie über `mergeRowEdits`.
 */
export function buildEinsatzRows(
  source: EinsatzRowSource,
  times: EinsatzTimes,
): EinsatzRow[] {
  const { fzgItems, crew, vehicles, persons, entries, firecall } = source;

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
      abfahrt: times.abfahrt,
      ankunft: times.ankunft,
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
 * Was die Server Action beim Speichern ergänzen wird. Der Client rechnet mit
 * der Luftlinien-Schätzung, damit eine Zeile nicht als unvollständig gemeldet
 * wird, obwohl sie speicherbar ist.
 *
 * Ein leeres Objekt heißt „Auffüllen aktiv, aber keine Strecke bekannt" — dann
 * werden Zähler ohne Streckenbezug weiterhin fortgeschrieben. Fehlt das Objekt
 * ganz, füllt niemand auf (die Einzelerfassung im Dialog).
 */
export interface EinsatzAutoFill {
  /**
   * Gesamtstrecke samt Herkunft; fehlt ohne Einsatzkoordinaten. Am Client immer
   * `'estimate'` — die gefahrene Route holt erst die Server Action.
   */
  distance?: RoundTripDistance;
}

/**
 * Was in der kompakten Zeile über die Kilometer steht. `undefined` heißt: Das
 * Fahrzeug hat keinen Kilometerzähler (ein Boot etwa) — dann gibt es hier
 * nichts anzuzeigen.
 */
export interface KmPreview {
  start?: number;
  end?: number;
  /**
   * Gesetzt, wenn der Endstand nicht eingetragen ist, sondern erst beim
   * Speichern entsteht. Am Client immer `'estimate'`; die Zeile muss das
   * kenntlich machen, sonst liest sich eine Schätzung wie eine Ablesung.
   */
  derived?: 'route' | 'estimate';
}

/**
 * Die Kilometer-Vorschau einer Zeile. Zeigt den eingetragenen Endstand, sonst
 * den, der beim Speichern ergänzt wird, sonst nur den Startstand.
 */
export function kmPreview(
  definitions: CounterDefinition[],
  counters: Record<string, CounterReading>,
  autoFill?: EinsatzAutoFill,
): KmPreview | undefined {
  const def = definitions.find(isKmCounter);
  if (!def) return undefined;

  const reading = counters[def.id] ?? {};
  if (reading.end !== undefined) {
    return { start: reading.start, end: reading.end };
  }
  if (autoFill?.distance && reading.start !== undefined) {
    return {
      start: reading.start,
      end: reading.start + autoFill.distance.roundTripKm,
      derived: autoFill.distance.source,
    };
  }
  return { start: reading.start };
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
  autoFill?: EinsatzAutoFill,
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
    // Gegen die aufgefüllten Zähler prüfen, nicht gegen die eingegebenen: Der
    // Kilometer-Endstand entsteht erst serverseitig aus der Route, sonst
    // meldete die Vorprüfung eine Zeile als unvollständig, die der Server
    // anstandslos speichert.
    const { counters } = autoFillCounterEnds(
      vehicle?.counters ?? [],
      row.counters,
      vehicle?.lastCounters ?? {},
      autoFill?.distance,
    );
    const errors = validateEntryInput(
      vehicle?.counters ?? [],
      {
        vehicleId: row.vehicleId,
        driverName: row.driverName,
        zweck: 'einsatz',
        ziel,
        abfahrt: row.abfahrt,
        ankunft: row.ankunft,
        counters,
      },
      // Dieselbe Lockerung, die die Server Action anwendet: Ein fehlender
      // Zählerstand hält die Fahrt nicht auf. Ohne den Gleichlauf meldete die
      // Vorprüfung eine Zeile als unvollständig, die der Server anstandslos
      // speichert.
      { countersOptional: true },
    );

    if (errors.length > 0) {
      partition.incomplete.push({ row, errors });
      continue;
    }
    covered.add(row.vehicleId);
    // Bewusst die unveränderte Zeile, nicht die aufgefüllte: Der Client rechnet
    // nur mit einer Luftlinien-Schätzung. Schickte er sie mit, hielte der Server
    // sie für eine Ablesung und schriebe eine geschätzte Zahl in ein
    // Nachweisdokument.
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
