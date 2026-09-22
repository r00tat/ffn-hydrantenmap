/**
 * Gesprochener Befehl → Fahrtenbuch-Eintrag.
 *
 * „Lege einen Fahrtenbucheintrag für das RLFA an, Kilometerstand 1723,
 * gefahren bin ich." Das Modell nennt Fahrzeug, Zählerstand und Fahrer so, wie
 * ein Mensch sie nennt — mit Namen. Hier werden daraus die IDs, mit denen die
 * Action arbeitet.
 *
 * Bewusst ein eigenes, reines Modul und nicht Teil der Server Action: Das
 * Auflösen von Namen ist die Stelle, an der ein Sprachbefehl schiefgeht, und
 * sie soll ohne Firestore prüfbar sein. Die Action daneben tut nur noch Laden,
 * Guard und Schreiben.
 *
 * Zwei Grundsätze ziehen sich durch:
 *
 * 1. **Geraten wird nichts.** Ein Name, der auf zwei Fahrzeuge passt, ist ein
 *    Rückfrage-Fall und kein Grund, das erste zu nehmen — im Fahrtenbuch stünde
 *    sonst eine Fahrt am falschen Fahrzeug, und über den Zähler-Cache
 *    verschöbe sie alle folgenden Stände.
 * 2. **Jede Absage nennt die Alternativen.** Das Modell bekommt die vorhandenen
 *    Fahrzeug- und Zählernamen zurück; ohne sie rät es beim nächsten Versuch
 *    denselben Namen.
 *
 * Hintergrund: [docs/fahrtenbuch.md](../../../docs/fahrtenbuch.md)
 */

import {
  arrivalFromTimeOnly,
  arrivalOnDepartureDay,
  FAHRT_ZWECKE,
  isTimeOnlyTimestamp,
  matchVehicleByName,
  normalizeName,
  normalizePersonName,
  timeOnSameDay,
  validateEntryInput,
  type CounterDefinition,
  type CounterReading,
  type FahrtenbuchDriverRef,
  type FahrtenbuchPerson,
  type FahrtenbuchVehicle,
  type FahrtZweck,
} from '../../common/fahrtenbuch';
import { parseTimestamp } from '../../common/time-format';
import { einsatzTimes, type EinsatzFirecall } from './einsatzRows';
import type { FahrtenbuchEntryInput } from './entryLogic';

/** Ein abgelesener Zählerstand, so wie er gesprochen wird. */
export interface AssistantCounterReading {
  /**
   * Zähler-ID oder Bezeichnung. Bei einem Fahrzeug mit genau einem Zähler —
   * dem Regelfall — überflüssig.
   */
  zaehler?: string;
  /** Der Stand bei der Rückkehr. */
  stand: number;
  /**
   * Der Stand bei der Abfahrt. Nur nötig, wenn das Fahrzeug noch keine
   * erfasste Fahrt hat; sonst steht er im Zähler-Cache.
   */
  startStand?: number;
}

/** Der Befehl, wie ihn das Werkzeug entgegennimmt. */
export interface AssistantEntryCommand {
  fahrzeug: string;
  zaehlerstaende?: AssistantCounterReading[];
  /** Leer oder „ich" heißt: der angemeldete Benutzer. */
  fahrer?: string;
  mitfahrer?: string[];
  zweck?: string;
  ziel?: string;
  abfahrt?: string;
  ankunft?: string;
  hinweise?: string;
}

export interface AssistantEntryContext {
  /** Die Fahrzeuge der Gruppe — inaktive sind vom Aufrufer auszusortieren. */
  vehicles: FahrtenbuchVehicle[];
  persons: FahrtenbuchPerson[];
  /** Der angemeldete Benutzer, für „gefahren bin ich". */
  self: { userId: string; name: string };
  /** Der laufende Einsatz, wenn die Fahrt an einem hängt. */
  firecall?: EinsatzFirecall;
  now: string;
}

export type AssistantEntryPlan =
  | { ok: true; vehicle: FahrtenbuchVehicle; input: FahrtenbuchEntryInput }
  | { ok: false; error: AssistantEntryError; message: string };

export type AssistantEntryError =
  | 'vehicleMissing'
  | 'vehicleUnknown'
  | 'vehicleAmbiguous'
  | 'counterUnknown'
  | 'counterAmbiguous'
  | 'invalid';

/** Wortlaute, mit denen der Sprecher sich selbst meint. */
const SELF_WORDS = new Set([
  'ich',
  'ich selbst',
  'mich',
  'mir',
  'selbst',
  'ich selber',
  'selber',
]);

function fail(
  error: AssistantEntryError,
  message: string,
): { ok: false; error: AssistantEntryError; message: string } {
  return { ok: false, error, message };
}

/** Aufzählung in vorlesbarer Form: „A, B und C". */
function listNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}`;
}

function counterLabel(definition: CounterDefinition): string {
  return definition.label || definition.id;
}

/**
 * Das gemeinte Fahrzeug.
 *
 * Vier Stufen, jede für sich ausgewertet: Steht auf einer Stufe genau ein
 * Fahrzeug, ist es das; stehen mehrere da, wird zurückgefragt; steht keines da,
 * geht es eine Stufe weiter. Die letzte Stufe fängt den umgekehrten Fall ab,
 * dass der Sprecher mehr sagt als im Fahrtenbuch steht („RLFA Neusiedl" gegen
 * „RLFA") — erst ab drei Zeichen, damit ein kurzer Name wie „VF" nicht in
 * jedem Satz vorkommt.
 */
export function matchAssistantVehicle(
  vehicles: FahrtenbuchVehicle[],
  name: string,
): FahrtenbuchVehicle[] {
  const exact = matchVehicleByName(vehicles, name);
  if (exact) return [exact];

  const query = normalizeName(name);
  if (!query) return [];

  const stages = [
    vehicles.filter((v) => normalizeName(v.name).startsWith(query)),
    vehicles.filter((v) => normalizeName(v.name).includes(query)),
    vehicles.filter((v) => {
      const candidate = normalizeName(v.name);
      return candidate.length >= 3 && query.includes(candidate);
    }),
  ];
  for (const stage of stages) {
    if (stage.length > 0) return stage;
  }
  return [];
}

/** Der gemeinte Zähler — dieselbe Stufenlogik wie beim Fahrzeug. */
function matchCounter(
  definitions: CounterDefinition[],
  name: string,
): CounterDefinition[] {
  const query = normalizeName(name);
  if (!query) return [];

  const byId = definitions.filter((d) => normalizeName(d.id) === query);
  if (byId.length > 0) return byId;

  const stages = [
    definitions.filter((d) => normalizeName(counterLabel(d)) === query),
    definitions.filter((d) => normalizeName(counterLabel(d)).startsWith(query)),
    definitions.filter((d) => normalizeName(counterLabel(d)).includes(query)),
  ];
  for (const stage of stages) {
    if (stage.length > 0) return stage;
  }
  return [];
}

/**
 * Die Zählerstände als `CounterReading`.
 *
 * Gesprochen wird der abgelesene Stand, nicht die gefahrene Strecke. Bei einem
 * Start/Ende-Zähler ist das der Endstand; der Startstand kommt aus dem
 * Zähler-Cache des Fahrzeugs, also aus der letzten erfassten Fahrt. Fehlt er
 * dort, bleibt er offen — die Prüfung meldet das, statt eine Differenz zu
 * erfinden.
 */
function resolveCounters(
  vehicle: FahrtenbuchVehicle,
  readings: AssistantCounterReading[],
):
  | { ok: true; counters: Record<string, CounterReading> }
  | { ok: false; error: AssistantEntryError; message: string } {
  const definitions = vehicle.counters ?? [];
  const counters: Record<string, CounterReading> = {};

  for (const reading of readings) {
    if (typeof reading?.stand !== 'number' || !Number.isFinite(reading.stand)) {
      continue;
    }

    let definition: CounterDefinition | undefined;
    if (reading.zaehler?.trim()) {
      const matches = matchCounter(definitions, reading.zaehler);
      if (matches.length === 0) {
        return fail(
          'counterUnknown',
          `Das ${vehicle.name} hat keinen Zähler „${reading.zaehler}". Es hat: ` +
            `${listNames(definitions.map(counterLabel))}.`,
        );
      }
      if (matches.length > 1) {
        return fail(
          'counterAmbiguous',
          `„${reading.zaehler}" passt beim ${vehicle.name} auf mehrere Zähler: ` +
            `${listNames(matches.map(counterLabel))}. Welcher ist gemeint?`,
        );
      }
      definition = matches[0];
    } else if (definitions.length === 1) {
      definition = definitions[0];
    } else if (definitions.length === 0) {
      return fail(
        'counterUnknown',
        `Für das ${vehicle.name} ist kein Zähler hinterlegt — es führt kein ` +
          'eigenes Fahrtenbuch.',
      );
    } else {
      return fail(
        'counterAmbiguous',
        `Das ${vehicle.name} hat mehrere Zähler: ` +
          `${listNames(definitions.map(counterLabel))}. Sag dazu, welcher ` +
          'Stand gemeint ist.',
      );
    }

    if (definition.mode === 'reading') {
      counters[definition.id] = { end: reading.stand };
      continue;
    }
    const start = reading.startStand ?? vehicle.lastCounters?.[definition.id];
    counters[definition.id] =
      start === undefined
        ? { end: reading.stand }
        : { start, end: reading.stand };
  }

  return { ok: true, counters };
}

/** Eine Person aus den Stammdaten, sonst der Name als Freitext. */
function matchPerson(
  persons: FahrtenbuchPerson[],
  name: string,
): FahrtenbuchDriverRef {
  const normalized = normalizePersonName(name);
  if (!normalized) return { name: name.trim() };
  const [match, ambiguous] = persons.filter(
    (p) => p.active !== false && normalizePersonName(p.name) === normalized,
  );
  // Zwei Treffer bleiben Freitext: Dann wäre offen, wessen Fahrt es ist, und
  // eine falsche Verknüpfung wiegt schwerer als ein unverknüpfter Name.
  return match && !ambiguous
    ? { id: match.id, name: match.name }
    : { name: name.trim() };
}

/**
 * Der Fahrer.
 *
 * „Ich" wird ausschließlich über `person.userIds` aufgelöst — die gepflegte
 * Zuordnung zwischen Benutzerkonto und Fahrtenbuch-Person. Ist sie nicht
 * gepflegt, steht der Anzeigename als Freitext da; über den Namen zu raten
 * verbietet sich, die Begründung steht an `EntryModifyActor`.
 */
function resolveDriver(
  command: AssistantEntryCommand,
  context: AssistantEntryContext,
): FahrtenbuchDriverRef {
  const spoken = command.fahrer?.trim();
  if (!spoken || SELF_WORDS.has(normalizeName(spoken))) {
    const linked = context.persons.find((p) =>
      p.userIds?.includes(context.self.userId),
    );
    return linked ? { id: linked.id, name: linked.name } : { name: context.self.name };
  }
  return matchPerson(context.persons, spoken);
}

/**
 * Abfahrt und Ankunft.
 *
 * Ohne Angabe gelten die Zeiten des Einsatzes — dieselbe Ableitung wie in der
 * Sammelerfassung, damit eine gesprochene und eine dort erfasste Fahrt
 * dieselbe Spanne tragen. Eine gesprochene Uhrzeit ohne Datum („zehn Uhr
 * fünfzehn") wird auf den Einsatztag gelegt; ohne diese Verankerung landete
 * sie auf heute, und bei einem Einsatz von gestern lägen Abfahrt und Ankunft
 * einen Tag auseinander.
 */
function resolveTimes(
  command: AssistantEntryCommand,
  context: AssistantEntryContext,
): { abfahrt: string; ankunft: string } {
  const fallback = context.firecall
    ? einsatzTimes([], context.firecall, context.now)
    : { abfahrt: context.now, ankunft: context.now };

  const spokenAbfahrt = parseTimestamp(command.abfahrt);
  const abfahrt = spokenAbfahrt
    ? isTimeOnlyTimestamp(command.abfahrt)
      ? timeOnSameDay(fallback.abfahrt, spokenAbfahrt.toDate())
      : spokenAbfahrt.toISOString()
    : fallback.abfahrt;

  const spokenAnkunft = parseTimestamp(command.ankunft);
  if (spokenAnkunft) {
    return {
      abfahrt,
      ankunft: isTimeOnlyTimestamp(command.ankunft)
        ? arrivalFromTimeOnly(abfahrt, spokenAnkunft.toDate())
        : spokenAnkunft.toISOString(),
    };
  }
  // Eine eigens genannte Abfahrt zieht die Ankunft mit: Die Ankunft des
  // Einsatzes kann vor einer frei gesprochenen Abfahrt liegen, und eine
  // Ankunft vor der Abfahrt ist kein gültiger Eintrag.
  return {
    abfahrt,
    ankunft: spokenAbfahrt
      ? arrivalOnDepartureDay(abfahrt, new Date(context.now))
      : fallback.ankunft,
  };
}

/**
 * Die Prüffehler als Satz, den das Modell vorlesen und beantworten kann.
 *
 * Übersetzt wird, was `validateEntryInput` liefert — die Prüfung selbst bleibt
 * die eine, die auch der Dialog und die Sammelerfassung verwenden. Ein
 * fehlender Zählerstand wird dabei danach unterschieden, ob der abgelesene
 * Stand fehlt oder nur der Wert bei der Abfahrt: Die Rückfrage ist eine
 * andere.
 */
function describeErrors(
  errors: string[],
  vehicle: FahrtenbuchVehicle,
  counters: Record<string, CounterReading>,
): string {
  const definitions = vehicle.counters ?? [];
  const labelOf = (id: string): string => {
    const definition = definitions.find((d) => d.id === id);
    return definition ? counterLabel(definition) : id;
  };

  const sentences = errors.map((error) => {
    const [key, counterId] = error.split(':');
    switch (key) {
      case 'driverMissing':
        return `Wer ist das ${vehicle.name} gefahren?`;
      case 'zielMissing':
        return 'Wohin ging die Fahrt? Ohne Einsatzbezug braucht sie ein Ziel.';
      case 'zweckInvalid':
        return `Der Zweck muss einer von diesen sein: ${listNames([...FAHRT_ZWECKE])}.`;
      case 'abfahrtInvalid':
        return 'Die Abfahrtszeit ist nicht lesbar.';
      case 'ankunftInvalid':
        return 'Die Ankunftszeit ist nicht lesbar.';
      case 'ankunftBeforeAbfahrt':
        return 'Die Ankunft liegt vor der Abfahrt.';
      case 'coDriversTooMany':
        return 'Es sind zu viele Mitfahrer angegeben.';
      case 'counterMissing': {
        const label = labelOf(counterId);
        const reading = counters[counterId];
        if (reading?.end !== undefined && reading.start === undefined) {
          return (
            `Für das ${vehicle.name} ist kein früherer ${label} bekannt. ` +
            'Sag den Stand bei der Abfahrt dazu.'
          );
        }
        return `Der ${label} des ${vehicle.name} fehlt.`;
      }
      case 'counterEndBeforeStart': {
        const reading = counters[counterId];
        return (
          `Der ${labelOf(counterId)} ${reading?.end} liegt unter dem Stand bei ` +
          `der Abfahrt (${reading?.start}).`
        );
      }
      default:
        return `Die Fahrt ist unvollständig (${error}).`;
    }
  });

  return sentences.join(' ');
}

/**
 * Der Bestätigungssatz nach dem Speichern — er wird vorgelesen, also
 * Fließtext ohne Aufzählungszeichen und mit ausgeschriebenen Einheiten.
 */
export function describeAssistantEntry(
  vehicle: FahrtenbuchVehicle,
  input: FahrtenbuchEntryInput,
): string {
  const definitions = vehicle.counters ?? [];
  const parts: string[] = [];

  for (const definition of definitions) {
    const reading = input.counters[definition.id];
    if (reading?.end === undefined) continue;
    const label = counterLabel(definition);
    parts.push(
      reading.diff !== undefined || reading.start !== undefined
        ? `${label} ${reading.end}, ${(reading.end - (reading.start ?? reading.end))} ${definition.unit} gefahren`
        : `${label} ${reading.end} ${definition.unit}`,
    );
  }

  if (input.driverName) parts.push(`gefahren von ${input.driverName}`);

  const ziel = input.firecallName || input.ziel;
  if (ziel) parts.push(`Ziel ${ziel}`);

  return `Fahrt des ${vehicle.name} eingetragen: ${parts.join(', ')}.`;
}

/**
 * Der gesprochene Befehl als Eingabe für `createFahrtenbuchEntry` — oder eine
 * Rückfrage, wenn er nicht eindeutig ist.
 */
export function planAssistantEntry(
  command: AssistantEntryCommand,
  context: AssistantEntryContext,
): AssistantEntryPlan {
  if (!command.fahrzeug?.trim()) {
    return fail('vehicleMissing', 'Für welches Fahrzeug soll die Fahrt sein?');
  }

  const candidates = matchAssistantVehicle(context.vehicles, command.fahrzeug);
  const known = listNames(context.vehicles.map((v) => v.name));
  if (candidates.length === 0) {
    return fail(
      'vehicleUnknown',
      `Kein Fahrzeug „${command.fahrzeug}" im Fahrtenbuch. Vorhanden sind: ${known}.`,
    );
  }
  if (candidates.length > 1) {
    return fail(
      'vehicleAmbiguous',
      `„${command.fahrzeug}" passt auf mehrere Fahrzeuge: ` +
        `${listNames(candidates.map((v) => v.name))}. Welches ist gemeint?`,
    );
  }
  const vehicle = candidates[0];

  const counters = resolveCounters(vehicle, command.zaehlerstaende ?? []);
  if (!counters.ok) return counters;

  const zweck = (
    command.zweck?.trim() || (context.firecall ? 'einsatz' : 'sonstiges')
  ) as FahrtZweck;
  const driver = resolveDriver(command, context);
  const { abfahrt, ankunft } = resolveTimes(command, context);

  const input: FahrtenbuchEntryInput = {
    vehicleId: vehicle.id as string,
    driverName: driver.name,
    zweck,
    ziel: command.ziel?.trim() ?? '',
    abfahrt,
    ankunft,
    counters: counters.counters,
  };
  if (driver.id) input.driverId = driver.id;
  if (command.hinweise?.trim()) input.hinweise = command.hinweise.trim();
  // Der Einsatzbezug gilt nur beim Zweck „einsatz" — `buildEntryDocument`
  // verwirft ihn sonst, und die Fahrt stünde ohne Zielangabe da. Deshalb wird
  // er hier gar nicht erst gesetzt und das Ziel verlangt.
  if (zweck === 'einsatz' && context.firecall) {
    input.firecallId = context.firecall.id;
    input.firecallName = context.firecall.name;
  }
  const coDrivers = (command.mitfahrer ?? [])
    .filter((name) => name?.trim())
    .map((name) => matchPerson(context.persons, name));
  if (coDrivers.length > 0) input.coDrivers = coDrivers;

  const errors = validateEntryInput(vehicle.counters ?? [], {
    vehicleId: input.vehicleId,
    driverName: input.driverName,
    coDrivers: input.coDrivers,
    zweck: input.zweck,
    ziel: input.ziel,
    firecallId: input.firecallId,
    abfahrt: input.abfahrt,
    ankunft: input.ankunft,
    counters: input.counters,
  });
  if (errors.length > 0) {
    return fail('invalid', describeErrors(errors, vehicle, input.counters));
  }

  return { ok: true, vehicle, input };
}
