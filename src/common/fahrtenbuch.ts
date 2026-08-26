// Subcollections unter groups/{groupId}
export const FAHRTENBUCH_PERSON_COLLECTION_ID = 'person';
export const FAHRTENBUCH_VEHICLE_COLLECTION_ID = 'vehicle';
export const FAHRTENBUCH_COLLECTION_ID = 'fahrtenbuch';

/**
 * Konfiguration je Gruppe — Dokument-ID ist die Gruppen-ID.
 *
 * Bewusst eine eigene Collection und nicht ein weiteres Feld am
 * Gruppen-Dokument: Dessen Regel erlaubt jedem Gruppenmitglied das Lesen
 * *aller* Felder, weil der Standort des Feuerwehrhauses im Client gebraucht
 * wird. Die Mailadresse eines Fahrzeugverantwortlichen ist dagegen nichts, was
 * jedes Mitglied auslesen soll. Diese Collection ist für Clients gesperrt
 * (`allow read, write: if false`) und nur über Admin-Actions zugänglich —
 * dieselbe Bauweise wie `blaulichtsmsConfig`.
 */
export const FAHRTENBUCH_CONFIG_COLLECTION_ID = 'fahrtenbuchConfig';

/** Obergrenze für die Empfängerliste — ein Riegel gegen eine manipulierte Anfrage. */
export const FAHRTENBUCH_MANGEL_EMAILS_MAX = 10;

/**
 * Höchstzahl der Zusatzfahrer je Fahrt — zehn Fahrer insgesamt. Ein Riegel
 * gegen eine manipulierte Anfrage, dieselbe Bauweise wie
 * `FAHRTENBUCH_MANGEL_EMAILS_MAX`.
 */
export const FAHRTENBUCH_MAX_CO_DRIVERS = 9;

export interface FahrtenbuchConfig {
  groupId: string;
  /**
   * Empfänger der Mangel-Benachrichtigung. Die erste Adresse wird `To`, alle
   * weiteren `Cc`. Eine leere Liste ist die Abschaltung — es gibt bewusst kein
   * zusätzliches `enabled`-Flag, das mit einer gepflegten Liste in Widerspruch
   * geraten könnte.
   */
  mangelEmails: string[];
  updatedAt: string;
  updatedBy: string;
}

export type CounterMode = 'startEnd' | 'reading';
export type CounterChangeWarning = 'decrease' | 'anyChange' | 'none';

export type FuelType = 'diesel' | 'benzin' | 'adblue' | 'oel';
export const FUEL_TYPES: FuelType[] = ['diesel', 'benzin', 'adblue', 'oel'];

/**
 * Antriebsstoffe. AdBlue und Öl werden nachgefüllt, treiben aber nichts an —
 * sie gehören weder in die Verbrauchsnäherung (l/100 km) noch in die Auswahl
 * der Kraftstoffspalte beim PDF-Import. Vor diesem Begriff stand an drei
 * Stellen ein eigenes `!== 'adblue'`; Öl wäre durch jede davon durchgerutscht.
 */
export const PROPELLANTS: FuelType[] = ['diesel', 'benzin'];

export function isPropellant(fuel: FuelType): boolean {
  return PROPELLANTS.includes(fuel);
}

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
 * Herkunft eines abgeleiteten Endstands:
 *
 * - `'route'` — aus der gefahrenen Straßenstrecke berechnet. Hin- und Rückweg
 *   stehen getrennt als `routeOutboundMeters`/`routeReturnMeters` am Eintrag
 *   und sind damit nachprüfbar.
 * - `'estimate'` — aus der Luftlinie mit Umwegfaktor geschätzt, weil kein
 *   Routing zu bekommen war. Streng von `'route'` getrennt: In einem
 *   Nachweisdokument muss eine geschätzte Zahl als solche erkennbar bleiben.
 * - `'unchanged'` — unverändert übernommen; bei Start/Ende-Zählern aus dem
 *   Startstand dieser Fahrt, bei Ablesezählern aus dem letzten bekannten Stand.
 *
 * Steht hier und nicht in `fahrtenbuchAutoFill.ts`: Bliebe der Typ dort, müsste
 * dieses Basismodul von seinem eigenen Konsumenten importieren.
 */
export type CounterSource = 'route' | 'estimate' | 'unchanged';

export interface FahrtenbuchPerson {
  id?: string;
  name: string;
  active: boolean;
  blaulichtSmsRecipientId?: string;
  /**
   * Benutzerkonten dieser Person — die einzige Zuordnung, auf die sich eine
   * Berechtigung stützen darf (siehe `entryPermissions.ts`). Gesetzt wird sie
   * vom Gerätemeister oder Admin über „Bestehende Benutzer zuordnen", nie von
   * dem, der sich darauf beruft.
   *
   * Eine Liste und kein einzelnes Feld, weil sich Mitglieder mehrfach
   * registrieren: Dieselbe Person hat dann zwei Konten, und beide sind sie.
   */
  userIds?: string[];
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
  /**
   * Anzahl der Mängel dieses Fahrzeugs, die noch Arbeit machen (`open` oder
   * `inProgress`). Serverseitig nach jeder Mangel-Mutation neu gezählt, damit
   * die Fahrzeugübersicht den Stand zeigen kann, ohne alle Mängel der Gruppe
   * zu laden — dieselbe Bauweise wie `lastCounters`.
   *
   * `undefined` heißt „Cache stammt aus der Zeit vor diesem Feld", nicht
   * „keine offenen Mängel". Andere Aussage als `lastEntryHasDefect`: Das sagt,
   * dass die *letzte Fahrt* einen Defekt gemeldet hat, und verschwindet mit
   * der nächsten Fahrt ohne Defekt — auch wenn der Mangel noch offen ist.
   */
  openMangelCount?: number;
  /**
   * Der Mangeldatensatz zur jüngsten Fahrt, `null` wenn es keinen gibt.
   * `undefined` heißt „Cache stammt aus der Zeit vor diesem Feld".
   *
   * Trennt, was `lastEntryHasDefect` allein nicht trennen kann: Ein Defekt mit
   * Mangeldatensatz ist ein Vorgang mit eigenem Status und spricht über den
   * Mängelzähler — ist er behoben, gibt es nichts mehr zu zeigen. Ein Defekt
   * ohne Mangeldatensatz stammt aus der Zeit vor der Mängelverwaltung und hat
   * keinen Status; dort bleibt „Defekt gemeldet" die einzige Aussage.
   */
  lastEntryMangelId?: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

/**
 * Ein Fahrer einer Fahrt: die verknüpfte Person, sonst nur der Name.
 *
 * Frei eingetippte Namen sind zugelassen — bei einem Gast auf einer Übung gibt
 * es keine Person in den Stammdaten. Der Statistik-Schlüssel fällt dann wie
 * beim Hauptfahrer auf den normalisierten Namen zurück (`driverKeyOf`).
 */
export interface FahrtenbuchDriverRef {
  id?: string;
  name: string;
}

/**
 * Die Kennungen, unter denen ein Fahrer wiedererkannt wird: seine Personen-ID
 * und sein normalisierter Name.
 *
 * Beide zusammen, weil ein Mensch auf einer Fahrt in zwei Gestalten auftreten
 * kann — als verknüpfte Person beim Hauptfahrer und als frei eingetippter Name
 * beim Zusatzfahrer. Nur über die ID verglichen, stünde er zweimal in der
 * Fahrt, und jeder von beiden bekäme die Hälfte der Strecke.
 *
 * Dass damit zwei verschiedene Personen mit gleichem Namen zusammenfallen, ist
 * bewusst in Kauf genommen: `driverKeyOf` führt sie in der Statistik ohnehin
 * unter einem Schlüssel. Eine hier anders getroffene Entscheidung würde nur
 * dort auseinanderlaufen.
 *
 * Steht in diesem Basismodul, weil beide Seiten dieselbe Regel brauchen: der
 * Schreibpfad (`sanitizeCoDrivers`) und die Statistik (`driverSharesOf`).
 */
export function driverIdentities(ref: { id?: string; name: string }): string[] {
  const tokens: string[] = [];
  const id = ref.id?.trim();
  if (id) tokens.push(`id:${id}`);
  const normalized = normalizePersonName(ref.name ?? '');
  if (normalized) tokens.push(`name:${normalized}`);
  return tokens;
}

/**
 * Alle Fahrer einer Fahrt als ein Text, Hauptfahrer zuerst.
 *
 * Für Nachweisdokument und Wochenbericht: Beide zeigen die Fahrer in der
 * bestehenden Fahrer-Spalte, ohne eine zweite Spalte. Die Tabelle im
 * Querformat ist schon breit, und die große Mehrheit der Fahrten hat keinen
 * Zusatzfahrer — eine eigene Spalte nähme allen anderen dauerhaft Platz weg.
 */
export function driverNamesOf(
  entry: Pick<FahrtenbuchEntry, 'driverName' | 'coDrivers'>,
): string {
  return [
    entry.driverName?.trim(),
    ...(entry.coDrivers ?? []).map((ref) => ref.name?.trim()),
  ]
    .filter(Boolean)
    .join(', ');
}

export interface FahrtenbuchEntry {
  id?: string;
  vehicleId: string;
  vehicleName: string;
  driverId?: string;
  driverName: string;
  /**
   * Weitere Fahrer, die sich auf dieser Fahrt abgewechselt haben — ohne den
   * Hauptfahrer, der in `driverName`/`driverId` steht.
   *
   * Bewusst additiv und nicht ein gemeinsames `drivers[]`: Ein Array mit
   * „Index 0 ist der Hauptfahrer" bräuchte eine Migration über alle
   * bestehenden Fahrten und versteckte die Pflicht/Optional-Unterscheidung in
   * einer Indexkonvention. `undefined` heißt „ein Fahrer"; eine leere Liste
   * wird nicht geschrieben.
   */
  coDrivers?: FahrtenbuchDriverRef[];
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
  /**
   * Gemessener Hinweg (Feuerwehrhaus → Einsatzort) in Metern. Zusammen mit
   * `routeReturnMeters` die Belegstelle für den Kilometer-Endstand.
   */
  routeOutboundMeters?: number;
  /** Gemessener Rückweg (Einsatzort → Feuerwehrhaus) in Metern. */
  routeReturnMeters?: number;
  /**
   * Einfache Routendistanz in Metern, die verdoppelt in den Kilometer-Endstand
   * eingegangen ist. Nur an Einträgen aus der Zeit vor der getrennten Messung
   * von Hin- und Rückweg — bei einer Anfahrt über die Autobahn lag der
   * verdoppelte Hinweg teils um Kilometer daneben. Wird nur noch gelesen und
   * bei einer Bearbeitung mitgeführt, nie neu geschrieben.
   */
  routeDistanceMeters?: number;
  betriebsmittel?: Partial<Record<FuelType, number>>;
  hinweise?: string;
  defekt?: boolean;
  /**
   * Beschreibung des gemeldeten Mangels — nur zusammen mit `defekt` gesetzt.
   *
   * Bewusst getrennt von `hinweise`: Vorher stand beides in einem Feld, und
   * weder die Mail an die Fahrzeugverantwortlichen noch der Export konnten
   * unterscheiden, was der Mangel ist und was nur nebenbei notiert wurde.
   * Optional, weil Einträge aus der Zeit davor es nicht haben — dort steckt
   * die Beschreibung, wenn überhaupt, in `hinweise`.
   */
  mangel?: string;
  group: string;
  deleted: boolean;
  createdAt: string;
  createdBy: string;
  createdByName: string;
  updatedAt: string;
  updatedBy: string;
  /**
   * Anzeigename dessen, der zuletzt geändert hat.
   *
   * Neben `updatedBy` (der UID), weil die Liste die Änderung ausweist und dort
   * keine Benutzerabfrage stattfinden soll — genauso wie `createdByName` neben
   * `createdBy` steht. Optional: Einträge aus der Zeit vor diesem Feld haben
   * es nicht, und deren Änderer ist nachträglich nicht mehr zu benennen.
   */
  updatedByName?: string;
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

/**
 * Ob für diese Einheit ein Fahrer anzugeben ist.
 *
 * Ein Wechselladeaufbau (WLA-Bergung, WLA-Logistik) oder ein Anhänger wird
 * aufgenommen bzw. gezogen — er hat keinen eigenen Fahrer und keine eigene
 * Wegstrecke. Die Zählerdefinitionen sind das Signal dafür: Die Vorlage „Ohne
 * Zähler" gilt genau für diese Einheiten (siehe `suggestPresetForVehicleName`).
 *
 * Bewusst an den Stammdaten und nicht an einer Namensregel zur Laufzeit
 * festgemacht: So entscheidet die Zähler-Vorlage des Fahrzeugs darüber, und ein
 * Anhänger mit einem Namen, den keine Regel erkennt, ist über die Stammdaten
 * geradezuziehen.
 */
export function requiresDriver(definitions: CounterDefinition[]): boolean {
  return definitions.length > 0;
}

export interface CounterWarning {
  counterId: string;
  type: 'decrease' | 'changed';
  lastValue: number;
  value: number;
}

export interface EntryInput {
  vehicleId: string;
  driverName: string;
  coDrivers?: FahrtenbuchDriverRef[];
  /** Muss einer der Werte aus `FAHRT_ZWECKE` sein. */
  zweck: string;
  ziel: string;
  /**
   * Nur der verknüpfte Einsatz, nicht ein frei eingetippter Name: Er macht die
   * Angabe von `ziel` entbehrlich, weil der Einsatz selbst benennt, wohin die
   * Fahrt ging, und Liste wie Export auf seinen Namen zurückfallen. Ein freier
   * Text hat diesen Rückhalt nicht — dahinter steht kein Datensatz.
   */
  firecallId?: string;
  abfahrt: string;
  ankunft: string;
  counters: Record<string, CounterReading>;
  defekt?: boolean;
  mangel?: string;
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
export interface ValidateEntryOptions {
  /**
   * Fehlende Zählerstände blockieren nicht. Für die Sammelerfassung aus dem
   * Einsatz: Dort füllt der Server auf, was er belegen kann, und der Rest darf
   * die Fahrt nicht verhindern. Eine Fahrt ohne Kilometerstand ist ein
   * unvollständiger Eintrag — eine gar nicht erfasste Fahrt ist eine Lücke im
   * Nachweis, und die ist schwerer zu heilen.
   *
   * Widersprüchliche Angaben werden weiterhin abgelehnt: Ein Endstand unter dem
   * Startstand ist kein fehlender, sondern ein falscher Wert.
   */
  countersOptional?: boolean;
}

export function validateEntryInput(
  definitions: CounterDefinition[],
  input: EntryInput,
  options?: ValidateEntryOptions,
): string[] {
  const errors: string[] = [];

  if (!input.vehicleId?.trim()) errors.push('vehicleMissing');
  if (!input.driverName?.trim() && requiresDriver(definitions)) {
    errors.push('driverMissing');
  }
  // Nur benannte Zusatzfahrer zählen: Ein leeres Chip-Feld aus der Oberfläche
  // ist kein Fehler, es wird beim Speichern verworfen. Über der Grenze wird
  // abgelehnt statt abgeschnitten — Namen still zu verwerfen wäre in einem
  // Nachweisdokument schlimmer als eine Fehlermeldung.
  const namedCoDrivers = (input.coDrivers ?? []).filter((ref) =>
    ref?.name?.trim(),
  );
  if (namedCoDrivers.length > FAHRTENBUCH_MAX_CO_DRIVERS) {
    errors.push('coDriversTooMany');
  }
  if (!FAHRT_ZWECKE.includes(input.zweck as FahrtZweck)) {
    errors.push('zweckInvalid');
  }
  // Wohin die Fahrt ging, gehört zum Nachweis. Der verknüpfte Einsatz beantwortet
  // das bereits — nur dort darf das Feld leer bleiben. Auch bei
  // `countersOptional`: Das lockert die Zählerstände, nicht den Zweck der Fahrt.
  if (!input.ziel?.trim() && !input.firecallId) errors.push('zielMissing');
  // Auch bei `countersOptional`: Ein Häkchen ohne Text ergibt eine Meldung an
  // die Fahrzeugverantwortlichen, die nicht sagt, was kaputt ist.
  if (input.defekt && !input.mangel?.trim()) errors.push('mangelMissing');

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

    if (def.required && !options?.countersOptional) {
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

/**
 * Der Name eines Menschen für den Vergleich — normalisiert **und** die
 * Namensteile sortiert.
 *
 * BlaulichtSMS liefert die Personen als „Nachname Vorname" und in dieser Form
 * gehen sie auch nach SYBOS; die interne Personenliste des Fahrtenbuchs führt
 * sie als „Vorname Nachname". Ohne Sortierung träfe der Namensvergleich nicht,
 * dieselbe Person stünde im Fahrtenbuch in zwei Varianten und Fahrerstatistik
 * wie geteilte Anteile liefen auseinander (#705).
 *
 * Dass damit „Klaus Peter" und „Peter Klaus" zusammenfallen, ist in Kauf
 * genommen: Wo daraus eine Verknüpfung entstehen würde, verlangt die
 * aufrufende Stelle Eindeutigkeit (`resolveDriver`) und lässt einen zweiten
 * Treffer als Freitext stehen.
 *
 * Nicht für Fahrzeuge — dort ist die Reihenfolge Teil des Namens.
 */
export function normalizePersonName(name: string): string {
  const normalized = normalizeName(name);
  if (!normalized) return '';
  return normalized.split(' ').sort().join(' ');
}

/**
 * Der Name eines Menschen in der Schreibweise der internen Personenliste.
 *
 * Aus BlaulichtSMS kommen die Personen als „Nachname Vorname", gepflegt sind
 * sie als „Vorname Nachname". Wo ein Name eindeutig auf eine Person trifft,
 * wird deren Schreibweise gezeigt — dieselbe Person soll in der Anwendung
 * nicht in zwei Varianten auftauchen.
 *
 * Nicht geraten wird: Ohne Treffer bleibt der Name, wie er kam. Vor- und
 * Nachname aus einer beliebigen Zeichenkette selbst zu erkennen geht nicht
 * verlässlich — „Anna Maria Berger" und „Berger Anna Maria" sind von außen
 * nicht zu unterscheiden. Zwei Treffer bleiben ebenfalls unverändert; dann
 * wäre offen, wessen Schreibweise gilt.
 */
export function personDisplayName(
  name: string,
  persons: { name: string }[],
): string {
  const normalized = normalizePersonName(name);
  if (!normalized) return name;
  const [match, ambiguous] = persons.filter(
    (p) => normalizePersonName(p.name) === normalized,
  );
  return match && !ambiguous ? match.name : name;
}

export function matchVehicleByName(
  vehicles: FahrtenbuchVehicle[],
  name: string,
): FahrtenbuchVehicle | undefined {
  const normalized = normalizeName(name);
  if (!normalized) return undefined;
  return vehicles.find((v) => normalizeName(v.name) === normalized);
}

/**
 * Die schon erfasste Fahrt dieses Fahrzeugs zu diesem Einsatz — der
 * Duplikatsfall. Pro Einsatz fährt ein Fahrzeug einmal; eine zweite Fahrt
 * derselben Kombination verdoppelt die Kilometer und verschiebt damit alle
 * folgenden Zählerstände.
 *
 * `excludeEntryId` ist die bearbeitete Fahrt selbst: Ohne sie meldete jede
 * Bearbeitung ihr eigenes Dokument als Duplikat.
 */
export function findEntryForFirecallVehicle(
  entries: FahrtenbuchEntry[],
  firecallId: string,
  vehicleId: string,
  excludeEntryId?: string,
): FahrtenbuchEntry | undefined {
  return entries.find(
    (e) =>
      !e.deleted &&
      e.firecallId === firecallId &&
      e.vehicleId === vehicleId &&
      (!excludeEntryId || e.id !== excludeEntryId),
  );
}

export interface VehicleTimeRange {
  vehicleId: string;
  /** ISO-Zeitstempel. */
  abfahrt: string;
  /** ISO-Zeitstempel. */
  ankunft: string;
  /** Die bearbeitete Fahrt selbst. */
  excludeEntryId?: string;
}

/**
 * Fahrten desselben Fahrzeugs, deren Zeitraum sich mit dem übergebenen
 * überschneidet. Ein Fahrzeug kann nicht zweimal gleichzeitig unterwegs sein —
 * die Überschneidung findet ein Duplikat auch dann, wenn keine Seite einen
 * Einsatz verknüpft hat (etwa eine Fahrt aus dem Gastformular hinter einem
 * Freigabe-Link, das den Einsatzbezug gar nicht mitschickt).
 *
 * Berührende Zeiträume zählen nicht: Ankunft und nächste Abfahrt auf derselben
 * Minute sind zwei aufeinanderfolgende Fahrten, keine doppelte.
 *
 * Unlesbare Zeitstempel ergeben keinen Treffer. Der Aufrufer zeigt daraus einen
 * Hinweis, und ein Hinweis auf Basis eines kaputten Datums wäre nur Rauschen.
 */
export function overlappingVehicleEntries(
  entries: FahrtenbuchEntry[],
  range: VehicleTimeRange,
): FahrtenbuchEntry[] {
  const start = Date.parse(range.abfahrt);
  const end = Date.parse(range.ankunft);
  if (Number.isNaN(start) || Number.isNaN(end)) return [];
  return entries.filter((e) => {
    if (e.deleted || e.vehicleId !== range.vehicleId) return false;
    if (range.excludeEntryId && e.id === range.excludeEntryId) return false;
    const otherStart = Date.parse(e.abfahrt ?? '');
    const otherEnd = Date.parse(e.ankunft ?? '');
    if (Number.isNaN(otherStart) || Number.isNaN(otherEnd)) return false;
    return start < otherEnd && otherStart < end;
  });
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
