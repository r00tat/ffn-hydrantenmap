import {
  arrivalFromTimeOnly,
  arrivalOnDepartureDay,
  findEntryForFirecallVehicle,
  isTimeOnlyTimestamp,
  matchVehicleByName,
  normalizePersonName,
  suggestPresetForVehicleName,
  timeOnSameDay,
  validateEntryInput,
  type CounterDefinition,
  type CounterReading,
  type FahrtenbuchDriverRef,
  type FahrtenbuchEntry,
  type FahrtenbuchPerson,
  type FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import type { FahrtenbuchEntryInput } from './entryLogic';
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
  /** Name der Einheit aus der Einsatzquelle. */
  sourceName: string;
  /**
   * Immer gesetzt: Eine Zeile entsteht nur für eine Einheit, die in den
   * Fahrtenbuch-Stammdaten steht (siehe `buildEinsatzRows`). Was dort fehlt,
   * bekommt keine Fahrt und damit auch keine Zeile.
   */
  vehicleId: string;
  vehicleName: string;
  driverId?: string;
  driverName: string;
  /**
   * Zusatzfahrer dieser Zeile. Nichts wird vorbelegt: Die über BlaulichtSMS
   * gemeldete Mannschaft eines Fahrzeugs ist nicht seine Fahrerliste — eine
   * Vorbelegung daraus erzeugte systematisch falsche Anteile in der Statistik.
   */
  coDrivers?: FahrtenbuchDriverRef[];
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

  // Reihenfolge-unabhängig: aus BlaulichtSMS kommt „Nachname Vorname", die
  // Personenliste führt „Vorname Nachname".
  const normalized = normalizePersonName(maschinist.name);
  const byName = normalized
    ? persons.filter((p) => normalizePersonName(p.name) === normalized)
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
 * Die Einheiten des Einsatzes: die Fzg-Items der Karte, ergänzt um Fahrzeuge,
 * die nur über die Mannschaftszuordnung bekannt sind.
 */
function einsatzUnits(
  fzgItems: EinsatzFzgItem[],
  crew: EinsatzCrewMember[],
): EinsatzFzgItem[] {
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
  return items;
}

/**
 * Baut die Zeilen der Sammelerfassung — eine je Einheit des Einsatzes, die in
 * den Fahrtenbuch-Stammdaten steht.
 *
 * Einheiten ohne Fahrzeug in den Stammdaten fallen heraus. Was dort nicht
 * geführt wird, braucht keine Fahrt: Ein Wechselladeaufbau oder ein Gerät auf
 * der Einsatzkarte ist keine Einheit mit eigenem Fahrtenbuch, und eine Zeile
 * dafür wäre nur eine Zeile, die niemand ausfüllen kann. Welche Einheiten das
 * betrifft, sagt `unitsWithoutVehicle` — damit ein Fahrzeug, das dort
 * versehentlich fehlt, nicht unbemerkt bleibt.
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

  return einsatzUnits(fzgItems, crew).flatMap((item) => {
    const groupVehicle = matchVehicleByName(vehicles, item.name ?? '');
    if (!groupVehicle?.id) return [];
    const vehicleId = groupVehicle.id;
    const { driverId, driverName } = resolveDriver(crew, persons, item.id);

    return [
      {
        key: item.id,
        sourceName: item.name ?? '',
        vehicleId,
        vehicleName: groupVehicle.name,
        driverId,
        driverName,
        abfahrt: times.abfahrt,
        ankunft: times.ankunft,
        counters: startCounters(groupVehicle),
        existingEntry: findEntryForFirecallVehicle(
          entries,
          firecall.id,
          vehicleId,
        ),
      },
    ];
  });
}

/**
 * Namen der Einheiten des Einsatzes, für die es kein Fahrzeug in den
 * Fahrtenbuch-Stammdaten gibt — die also keine Zeile bekommen.
 *
 * Der Gegenwert zum stillen Weglassen in `buildEinsatzRows`: Für einen
 * Wechselladeaufbau ist das Weglassen richtig, für ein Fahrzeug, dessen Name in
 * den Stammdaten anders geschrieben steht, wäre es eine Lücke im Nachweis. Ein
 * Hinweis in der Oberfläche macht den Unterschied sichtbar, ohne die Liste mit
 * Zeilen zu füllen, die niemand ausfüllen kann.
 *
 * Anhänger und Wechselladeaufbauten sind davon ausgenommen: Sie fahren nicht
 * selbst und führen kein eigenes Fahrtenbuch, im Hinweis wären sie Rauschen und
 * ließen ein wirklich fehlendes Fahrzeug untergehen. Erkannt werden sie an
 * derselben Namensregel, die beim Import über das Zähler-Preset entscheidet
 * (`suggestPresetForVehicleName`, Preset „Ohne Zähler"). Zwei Antworten auf die
 * Frage, ob eine Einheit ein eigenes Fahrtenbuch führt, wären der Fehler.
 */
export function unitsWithoutVehicle(
  source: Pick<EinsatzRowSource, 'fzgItems' | 'crew' | 'vehicles'>,
): string[] {
  const names = einsatzUnits(source.fzgItems, source.crew)
    // Erst gegen die Stammdaten, dann gegen die Namensregel: Ein Anhänger, der
    // doch in den Stammdaten steht, bekommt eine Zeile und darf schon deshalb
    // nicht im Hinweis stehen.
    .filter((item) => !matchVehicleByName(source.vehicles, item.name ?? ''))
    .filter((item) => suggestPresetForVehicleName(item.name ?? '') !== 'none')
    .map((item) => (item.name ?? '').trim())
    .filter(Boolean);
  // Dieselbe Einheit kann zweimal auf der Karte stehen; im Hinweis genügt sie
  // einmal.
  return [...new Set(names)];
}

/** Eine übersprungene Zeile samt der Fehlerschlüssel, die sie blockieren. */
export interface EinsatzRowIssue {
  row: EinsatzRow;
  errors: string[];
}

export interface EinsatzRowPartition {
  /** Vollständig und speicherbar. */
  ready: EinsatzRow[];
  /** Pflichtangaben fehlen — wird gemeldet. */
  incomplete: EinsatzRowIssue[];
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
 * und als von Hand gesetztes Fzg-Item, oder weil zwei Namensschreibweisen auf
 * dasselbe Fahrzeug treffen. Es wird trotzdem nur einmal geschrieben.
 */
export function partitionEinsatzRows(
  rows: EinsatzRow[],
  vehicles: FahrtenbuchVehicle[],
  ziel: string,
  autoFill?: EinsatzAutoFill,
  /**
   * Der Einsatz, dem die Fahrten zugeschrieben werden. Er macht das Ziel
   * entbehrlich — ohne ihn meldete die Vorprüfung eine Zeile als unvollständig,
   * die der Server anstandslos speichert, sobald der Einsatz keinen Namen hat.
   */
  firecallId?: string,
): EinsatzRowPartition {
  const partition: EinsatzRowPartition = {
    ready: [],
    incomplete: [],
    existing: [],
  };
  const covered = new Set<string>();

  for (const row of rows) {
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
        firecallId,
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
 * Die Eintrags-Inputs zu den erfassungsbereiten Zeilen.
 *
 * Kein `vehicleName`: Den leitet der Server aus dem geladenen Fahrzeug ab,
 * damit Name und Zähler nicht auseinanderlaufen können. Der Einsatzname ist
 * gleichzeitig das Ziel — der Einsatz benennt, wohin die Fahrt ging.
 *
 * Stand vorher inline in der Oberfläche und war damit von keinem Test erreicht.
 * Hier ist sie prüfbar, und ein neues Feld am Eintrag kann auf dem Weg nicht
 * mehr unbemerkt verlorengehen.
 */
export function entryInputsFromRows(
  rows: EinsatzRow[],
  options: { firecallId: string; firecallName: string },
): FahrtenbuchEntryInput[] {
  return rows.map((row) => {
    const input: FahrtenbuchEntryInput = {
      vehicleId: row.vehicleId,
      driverId: row.driverId,
      driverName: row.driverName,
      zweck: 'einsatz',
      firecallId: options.firecallId,
      firecallName: options.firecallName,
      ziel: options.firecallName,
      abfahrt: row.abfahrt,
      ankunft: row.ankunft,
      counters: row.counters,
    };
    if (row.coDrivers?.length) input.coDrivers = row.coDrivers;
    return input;
  });
}

/**
 * Legt die Eingaben des Benutzers über die neu berechneten Zeilen. Ein
 * Firestore-Snapshot (etwa nach dem Speichern) berechnet die Zeilen neu;
 * ohne dieses Zusammenführen verlöre eine Zeile, die noch nicht gespeichert
 * werden konnte, ihre bereits getippten Werte. Felder, die niemand angefasst
 * hat, kommen weiter frisch aus den Quelldaten.
 *
 * `existingEntry` wird dabei immer neu bestimmt und nie aus den Eingaben
 * übernommen — eine Eingabe darf die Duplikatserkennung nicht umgehen können.
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
    merged.existingEntry = findEntryForFirecallVehicle(
      entries,
      firecallId,
      merged.vehicleId,
    );
    return merged;
  });
}
