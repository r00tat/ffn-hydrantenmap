'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  arrivalOnDepartureDay,
  FAHRTENBUCH_MAX_CO_DRIVERS,
  findEntryForFirecallVehicle,
  overlappingVehicleEntries,
  referenceCounters,
  validateEntryInput,
  type CounterDefinition,
  type CounterReading,
  type FahrtenbuchDriverRef,
  type FahrtenbuchEntry,
  type FahrtZweck,
  type FuelType,
} from '../../common/fahrtenbuch';
import {
  applyRoundTripToKmCounters,
  type RoundTripDistance,
} from '../../common/fahrtenbuchAutoFill';
import type { FahrtenbuchEntryInput } from './entryLogic';

export interface FahrtenbuchFirecallOption {
  id: string;
  name: string;
  /** Alarmierungszeitpunkt — auf Einsatzebene ist das `firecall.date`. */
  date?: string;
  abruecken?: string;
}

/**
 * Die Felder eines Fahrzeugs, die das Formular braucht. Absichtlich schmaler
 * als `FahrtenbuchVehicle`: die Gastseite reicht nur eine Projektion durch,
 * und beide sollen dasselbe Formular füttern können.
 */
export interface EntryFormVehicle {
  id?: string;
  name: string;
  counters: CounterDefinition[];
  fuelTypes: FuelType[];
  lastCounters?: Record<string, number>;
}

export interface EntryFormPerson {
  id?: string;
  name: string;
}

export interface EntryFormSubmitResult {
  success: boolean;
  error?: string;
}

export interface EntryFormSubmitOptions {
  /**
   * Der Benutzer hat das gemeldete Duplikat ausdrücklich bestätigt. Wird an die
   * Server-Action durchgereicht, die ohne das Flag ablehnt.
   */
  confirmDuplicate?: boolean;
}

export interface UseEntryFormStateOptions {
  vehicles: EntryFormVehicle[];
  /** Fehlt die Liste, gibt es keine Einsatzauswahl — der Fall der Gastseite. */
  firecalls?: FahrtenbuchFirecallOption[];
  /** Bereits geladene Einträge — Grundlage für die Warnung beim Bearbeiten. */
  entries?: FahrtenbuchEntry[];
  /** Vorbelegtes Fahrzeug. */
  vehicleId?: string;
  /** Gesetzt beim Bearbeiten. */
  entry?: FahrtenbuchEntry;
  /**
   * Der in der App ausgewählte Einsatz — sonst der letzte, das entscheidet
   * schon `useFirecall`. Grundlage der Vorbelegung bei einem neuen Eintrag.
   */
  activeFirecallId?: string;
  /**
   * Holt die Gesamtstrecke zum verknüpften Einsatz. Fehlt die Funktion, gibt es
   * keinen Knopf „Fahrtstrecke berechnen" — das Gastformular hinter einem
   * Freigabe-Link kennt keinen Einsatz.
   */
  resolveDistance?: (
    firecallId: string,
  ) => Promise<RoundTripDistance | undefined>;
  onSubmit: (
    input: FahrtenbuchEntryInput,
    options: EntryFormSubmitOptions,
  ) => Promise<EntryFormSubmitResult>;
}

/** Wandelt einen ISO-Zeitstempel in den Wert für `datetime-local` um. */
export function toLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function fromLocalInput(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

/**
 * Startwerte aus dem Zähler-Cache des Fahrzeugs. Nur `startEnd`-Zähler haben
 * einen Startwert; ein `reading`-Zähler wird bei der Rückkehr abgelesen.
 */
function prefillCounters(
  definitions: CounterDefinition[],
  lastCounters: Record<string, number> = {},
): Record<string, CounterReading> {
  const prefilled: Record<string, CounterReading> = {};
  for (const def of definitions) {
    if (def.mode !== 'startEnd') continue;
    const start = lastCounters[def.id];
    if (start !== undefined) prefilled[def.id] = { start };
  }
  return prefilled;
}

/**
 * Der Einsatz, mit dem ein neuer Eintrag vorbelegt wird: der aktive, sonst der
 * neueste der Gruppe.
 *
 * Die Fahrt zum laufenden Einsatz ist der Regelfall. Vorbelegt spart sie drei
 * Eingaben — Zweck, Einsatz und die Fahrstrecke, die der verknüpfte Einsatz
 * selbst benennt.
 *
 * Der aktive Einsatz kommt aus der app-weiten Auswahl, die Liste aus der Gruppe
 * dieses Fahrtenbuchs; beides muss nicht zusammenpassen. Steht er nicht in der
 * Liste, gilt deshalb der neueste — die Liste kommt absteigend nach Datum.
 */
export function defaultFirecallOption(
  firecalls: FahrtenbuchFirecallOption[] | undefined,
  activeFirecallId?: string,
): FahrtenbuchFirecallOption | undefined {
  if (!firecalls?.length) return undefined;
  return firecalls.find((f) => f.id === activeFirecallId) ?? firecalls[0];
}

/**
 * Fehlerschlüssel, die die Server Actions unverändert zurückgeben.
 * `linkInvalid` kann nur über den Fahrtenbuch-Share-Link entstehen — der
 * eingeloggte Dialog bekommt ihn nie. Die Liste deckt beide Aufrufer ab.
 */
const TRANSLATED_SAVE_ERRORS = [
  'notAllowed',
  'duplicateFirecallEntry',
  'notInGroup',
  'entryDeleted',
  'tooManyEntries',
  // Aus dem Share-Pfad: Er meldet ausschließlich diese vier Schlüssel, damit
  // keine internen Meldungen an anonyme Besucher gehen.
  'linkInvalid',
  'vehicleNotFound',
  'invalidEntry',
  'shareSaveFailed',
  'firecallInvalid',
] as const;

export type EntryFormState = ReturnType<typeof useEntryFormState>;

/**
 * Zustand, Validierung und Absenden des Fahrten-Formulars. Zwei Aufrufer teilen
 * sich das: der Dialog des angemeldeten Fahrtenbuchs und das Gastformular
 * hinter einem geteilten Link. Was hier steht, kann zwischen beiden nicht
 * auseinanderlaufen.
 */
export function useEntryFormState({
  vehicles,
  firecalls,
  entries = [],
  vehicleId,
  entry,
  activeFirecallId,
  resolveDistance,
  onSubmit,
}: UseEntryFormStateOptions) {
  const t = useTranslations('fahrtenbuch');
  const [selectedVehicleId, setSelectedVehicleId] = useState(
    entry?.vehicleId ?? vehicleId ?? '',
  );
  const [driverName, setDriverName] = useState(entry?.driverName ?? '');
  const [driverId, setDriverId] = useState<string | undefined>(entry?.driverId);
  const [coDrivers, setCoDrivers] = useState<FahrtenbuchDriverRef[]>(
    entry?.coDrivers ?? [],
  );
  const [zweck, setZweck] = useState<FahrtZweck>(entry?.zweck ?? 'sonstiges');
  const [firecallId, setFirecallId] = useState<string | undefined>(
    entry?.firecallId,
  );
  // Der Name des **verknüpften** Einsatzes, getrennt von `firecallId` geführt:
  // Beim Bearbeiten kommt er aus dem Eintrag und nicht aus der Einsatzliste —
  // steht der verknüpfte Einsatz nicht mehr in den geladenen 50, bliebe das
  // Feld sonst leer. Freitext landet **nicht** hier, sondern im Ziel (siehe
  // `commitFirecallInput`).
  const [firecallName, setFirecallName] = useState(entry?.firecallName ?? '');
  // Was im Einsatzfeld getippt steht. Eigener Zustand, weil das Feld beim
  // Tippen die Liste filtert, ohne dass schon etwas verknüpft ist.
  const [firecallInput, setFirecallInput] = useState(entry?.firecallName ?? '');
  const [ziel, setZiel] = useState(entry?.ziel ?? '');
  const [abfahrt, setAbfahrt] = useState(
    entry?.abfahrt ?? new Date().toISOString(),
  );
  const [ankunft, setAnkunft] = useState(
    entry?.ankunft ?? arrivalOnDepartureDay(new Date().toISOString()),
  );
  const [betriebsmittel, setBetriebsmittel] = useState<
    Partial<Record<FuelType, number>>
  >(entry?.betriebsmittel ?? {});
  const [hinweise, setHinweise] = useState(entry?.hinweise ?? '');
  const [defekt, setDefekt] = useState(entry?.defekt ?? false);
  const [mangel, setMangel] = useState(entry?.mangel ?? '');
  const [errors, setErrors] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string>();
  const [saving, setSaving] = useState(false);
  // Bestätigt wird eine Einsatz/Fahrzeug-Kombination, nicht das Formular:
  // Wechselt eines von beiden, ist die Bestätigung hinfällig. Der Schlüssel
  // statt einer Eintrags-ID, weil auch die Server-Antwort ein Duplikat melden
  // kann, dessen Eintrag der Browser nie gesehen hat (Gastseite).
  const [confirmedDuplicateKey, setConfirmedDuplicateKey] = useState<string>();
  // Ein Duplikat, das erst die Server-Action gemeldet hat — für die Gastseite
  // der einzige Weg, davon zu erfahren, und im Dialog der Fall, dass ein
  // anderes Gerät die Fahrt inzwischen erfasst hat.
  const [serverDuplicateKey, setServerDuplicateKey] = useState<string>();

  const vehicle = useMemo(
    () => vehicles.find((v) => v.id === selectedVehicleId),
    [vehicles, selectedVehicleId],
  );
  const definitions = useMemo(() => vehicle?.counters ?? [], [vehicle]);

  // Kein useEffect zum Vorbelegen: die Zählerstände werden beim Rendern
  // abgeleitet. Der Zustand merkt sich, zu welchem Fahrzeug die Eingaben
  // gehören — nach einem Fahrzeugwechsel greift wieder die Vorbelegung aus
  // dem Zähler-Cache des neuen Fahrzeugs.
  const [countersState, setCountersState] = useState<{
    vehicleId: string;
    values: Record<string, CounterReading>;
  }>(() =>
    entry
      ? { vehicleId: entry.vehicleId, values: entry.counters ?? {} }
      : { vehicleId: '', values: {} },
  );

  const counters =
    countersState.vehicleId === selectedVehicleId
      ? countersState.values
      : prefillCounters(definitions, vehicle?.lastCounters);

  const setCounters = (values: Record<string, CounterReading>) =>
    setCountersState({ vehicleId: selectedVehicleId, values });

  const lastCounters = referenceCounters(
    entries,
    selectedVehicleId,
    vehicle?.lastCounters ?? {},
    entry?.id,
  );

  const counterLabel = (id: string) => {
    const def = definitions.find((d) => d.id === id);
    if (!def) return id;
    return def.labelKey ? t(def.labelKey as 'counters.km') : def.label;
  };

  const errorMessage = (error: string) => {
    const [key, counterId] = error.split(':');
    // Die einzige Meldung mit einem Platzhalter, der nicht von einem Zähler
    // kommt — ohne diesen Zweig stünde „{count}" im Text.
    if (key === 'coDriversTooMany') {
      return t('errors.coDriversTooMany', { count: FAHRTENBUCH_MAX_CO_DRIVERS });
    }
    if (counterId) {
      return t(`errors.${key}` as 'errors.counterMissing', {
        counter: counterLabel(counterId),
      });
    }
    return t(`errors.${key}` as 'errors.vehicleMissing');
  };

  const changeAbfahrt = (next: string) => {
    setAbfahrt(next);
    // Die Ankunft zieht mit dem Datum mit und behält ihre Uhrzeit — eine Fahrt
    // endet im Normalfall am Tag der Abfahrt. Ein Ende nach Mitternacht bleibt
    // über das Ankunftsfeld eintragbar.
    if (next) {
      setAnkunft((current) => arrivalOnDepartureDay(next, new Date(current)));
    }
  };

  const changeVehicle = (id: string) => setSelectedVehicleId(id);

  /**
   * Auswahl aus der Liste liefert ID und Namen, freie Eingabe nur den Namen.
   * Der Zeitvorschlag hängt an der Auswahl: ein frei eingegebener Einsatz hat
   * weder Alarmierung noch Abrücken, und ein bereits eingetragener Zeitraum
   * darf durch das Tippen im Namensfeld nicht überschrieben werden.
   */
  const changeFirecall = (id: string | undefined, name: string) => {
    setFirecallId(id || undefined);
    setFirecallName(id ? name : '');
    setFirecallInput(id ? name : '');
    setConfirmedDuplicateKey(undefined);
    const firecall = id ? firecalls?.find((f) => f.id === id) : undefined;
    // Die Verknüpfung setzt den Zweck mit. `submit` schickt `firecallId` nur
    // beim Zweck `einsatz` — ohne das verlöre eine Fahrt, an der jemand einen
    // Einsatz ausgewählt und den Zweck nicht angepasst hat, die Verknüpfung
    // stillschweigend, und keine Duplikatserkennung fände sie je wieder.
    if (id) setZweck('einsatz');
    if (firecall?.date) setAbfahrt(firecall.date);
    if (firecall?.abruecken) setAnkunft(firecall.abruecken);
  };

  /**
   * Übernimmt getippten Text aus dem Einsatzfeld als Fahrtstrecke / Ziel.
   *
   * Hinter einem getippten Namen steht kein Einsatz — kein Ort, keine Zeiten,
   * keine Duplikatserkennung. Als zweites Namensfeld daneben wäre er nur eine
   * weitere Stelle, an der dasselbe stehen kann; als Ziel ist er dort, wo Liste,
   * Export und Wochenbericht ihn ohnehin lesen. Das Einsatzfeld hält damit
   * ausschließlich verknüpfte Einsätze.
   *
   * Aufgerufen beim Verlassen des Feldes: Während des Tippens filtert der Text
   * die Liste und könnte noch zu einer Auswahl führen.
   *
   * Der Text bleibt dabei im Feld stehen. Beim Zweck `einsatz` ist das
   * Einsatzfeld das einzige Feld dieser Zeile — geräumt wäre die Eingabe für
   * den Benutzer verschwunden, obwohl sie gespeichert wird.
   */
  const commitFirecallInput = () => {
    if (firecallId) return;
    const text = firecallInput.trim();
    if (!text) return;
    setZiel(text);
  };

  /**
   * Der Zweck, mit der Einsatzverknüpfung im Schlepptau: Ein anderer Zweck als
   * `einsatz` speichert keinen Einsatz, also darf auch keiner im Feld
   * stehenbleiben. Was zu sehen ist, muss dem entsprechen, was gespeichert wird.
   */
  const changeZweck = (next: FahrtZweck) => {
    setZweck(next);
    if (next !== 'einsatz') {
      setFirecallId(undefined);
      setFirecallName('');
      setFirecallInput('');
      setConfirmedDuplicateKey(undefined);
    }
  };

  /** Name und zugehörige Personen-ID immer gemeinsam setzen — sonst zeigt
   *  `driverId` nach einer freien Eingabe noch auf die vorige Person. */
  const changeDriver = (name: string, id?: string) => {
    setDriverName(name);
    setDriverId(id);
  };

  /**
   * Die Zusatzfahrer als Ganzes setzen. Das Chip-Feld liefert bei jeder
   * Änderung die vollständige Liste; einzelne Zugänge und Abgänge nachzuhalten
   * wäre Zustand, der auseinanderlaufen kann.
   */
  const changeCoDrivers = (refs: FahrtenbuchDriverRef[]) => {
    setCoDrivers(refs);
  };

  /**
   * Belegt einen neuen Eintrag mit dem aktiven Einsatz vor — einmalig.
   *
   * Als Effekt und nicht als Anfangswert des Zustands, weil die Einsatzliste
   * ein Firestore-Snapshot ist und beim ersten Rendern noch leer sein kann; ein
   * `useState`-Initialisierer liefe genau dann ins Leere.
   *
   * Der Riegel ist `defaultAppliedRef`: Wer die Auswahl absichtlich räumt oder
   * den Zweck wechselt, soll sie beim nächsten Snapshot nicht zurückbekommen.
   * Beim Bearbeiten gilt ohnehin der Eintrag.
   */
  const defaultAppliedRef = useRef(false);
  useEffect(() => {
    if (entry || defaultAppliedRef.current) return;
    const option = defaultFirecallOption(firecalls, activeFirecallId);
    if (!option) return;
    defaultAppliedRef.current = true;
    changeFirecall(option.id, option.name);
    // `changeFirecall` ist bei jedem Rendern neu und gehört deshalb nicht in
    // die Abhängigkeiten — der Effekt hängt an der Liste, nicht an der
    // Funktion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, firecalls, activeFirecallId]);

  /**
   * Die schon erfasste Fahrt dieses Fahrzeugs zu diesem Einsatz.
   *
   * Nur bei verknüpftem Einsatz: Hinter einem frei eingetippten Namen steht
   * kein Datensatz, über den sich zwei Fahrten überhaupt zuordnen ließen.
   */
  const duplicateEntry = useMemo(
    () =>
      zweck === 'einsatz' && firecallId && selectedVehicleId
        ? findEntryForFirecallVehicle(
            entries,
            firecallId,
            selectedVehicleId,
            entry?.id,
          )
        : undefined,
    [entries, zweck, firecallId, selectedVehicleId, entry?.id],
  );

  /** Die Kombination, um die es geht — Grundlage jeder Bestätigung. */
  const duplicateKey =
    firecallId && selectedVehicleId
      ? `${firecallId}:${selectedVehicleId}`
      : undefined;

  /**
   * Ob für diese Kombination ein Duplikat gemeldet ist — aus dem eigenen
   * Snapshot oder von der Server-Action.
   */
  const duplicateReported =
    !!duplicateEntry || (!!duplicateKey && serverDuplicateKey === duplicateKey);

  const duplicateConfirmed =
    duplicateReported && !!duplicateKey && confirmedDuplicateKey === duplicateKey;

  /**
   * Fahrten desselben Fahrzeugs, deren Zeitraum sich überschneidet. Nur ein
   * Hinweis: Zeiten sind im Einsatz oft geschätzt, und ein Riegel hier würde
   * das Nachtragen einer Fahrt verhindern, deren Zeiten nur ungenau sind.
   * Findet auch das Duplikat einer Fahrt ohne Einsatzverknüpfung.
   *
   * Die schon als Duplikat gemeldete Fahrt bleibt außen vor — zweimal dieselbe
   * Fahrt zu nennen macht den Hinweis nur unübersichtlich. Übernimmt der
   * Einsatz seine Zeiten, wäre das der Regelfall.
   */
  const overlappingEntries = useMemo(
    () =>
      selectedVehicleId
        ? overlappingVehicleEntries(entries, {
            vehicleId: selectedVehicleId,
            abfahrt,
            ankunft,
            excludeEntryId: entry?.id,
          }).filter((e) => e.id !== duplicateEntry?.id)
        : [],
    [entries, selectedVehicleId, abfahrt, ankunft, entry?.id, duplicateEntry?.id],
  );

  /**
   * Ankunft vor Abfahrt — abgeleitet statt erst beim Speichern gemeldet, damit
   * das Feld sofort als falsch zu erkennen ist. Die Ablehnung selbst kommt
   * weiter aus `validateEntryInput` und gilt damit auch serverseitig.
   */
  const timeOrderInvalid = useMemo(() => {
    const start = Date.parse(abfahrt);
    const end = Date.parse(ankunft);
    return !Number.isNaN(start) && !Number.isNaN(end) && end < start;
  }, [abfahrt, ankunft]);

  /**
   * Ob der verknüpfte Einsatz das Ziel bereits benennt. Nur die Verknüpfung
   * zählt, nicht ein frei eingetippter Einsatzname — dieselbe Grenze zieht
   * `validateEntryInput`.
   */
  const zielCoveredByFirecall = zweck === 'einsatz' && !!firecallId;

  const [distanceBusy, setDistanceBusy] = useState(false);
  const [distanceResult, setDistanceResult] = useState<{
    roundTripKm: number;
    source: 'route' | 'estimate';
  }>();
  const [distanceError, setDistanceError] = useState(false);

  /**
   * Rechnet den Kilometer-Endstand aus der Route zum Einsatz.
   *
   * Nur bei verknüpftem Einsatz: Hinter einem frei eingetippten Namen stehen
   * keine Koordinaten. Überschreibt einen eingetragenen Endstand — der Knopf
   * ist eine ausdrückliche Ansage, kein Vorbelegen.
   */
  const calculateDistance = async () => {
    if (!resolveDistance || !firecallId) return;
    setDistanceBusy(true);
    setDistanceError(false);
    setDistanceResult(undefined);
    const distance = await resolveDistance(firecallId);
    setDistanceBusy(false);
    if (!distance) {
      setDistanceError(true);
      return;
    }
    setDistanceResult({
      roundTripKm: distance.roundTripKm,
      source: distance.source,
    });
    setCounters(applyRoundTripToKmCounters(definitions, counters, distance));
  };

  const submit = async (
    options: EntryFormSubmitOptions = {},
  ): Promise<EntryFormSubmitResult> => {
    // Kein vehicleName: der Server leitet ihn aus dem geladenen Fahrzeug ab,
    // damit Name und Zähler nicht auseinanderlaufen können.
    const input: FahrtenbuchEntryInput = {
      vehicleId: selectedVehicleId,
      driverId,
      driverName,
      coDrivers,
      zweck,
      firecallId: zweck === 'einsatz' ? firecallId : undefined,
      // Nur zum verknüpften Einsatz gehört ein Name. Getippter Text steht im
      // Ziel, nicht hier.
      firecallName:
        zweck === 'einsatz' && firecallId
          ? firecallName.trim() || undefined
          : undefined,
      // Benennt der verknüpfte Einsatz das Ziel, wird das Feld nicht gezeigt —
      // dann darf auch kein alter Text von vor der Auswahl mitgehen. Liste,
      // Export und Wochenbericht fallen auf `firecallName` zurück.
      ziel: zielCoveredByFirecall ? '' : ziel,
      abfahrt,
      ankunft,
      counters,
      betriebsmittel,
      hinweise,
      defekt,
      // Ohne Häkchen wird die Beschreibung nicht mitgeschickt: Wer den Defekt
      // abwählt, hat ihn zurückgenommen — der Text im ausgeblendeten Feld darf
      // nicht stillschweigend am Eintrag hängen bleiben.
      mangel: defekt ? mangel : undefined,
    };

    const validationErrors = validateEntryInput(definitions, input);
    // Das Duplikat steht bei den Fehlern und nicht bei den Warnungen: Ohne
    // Bestätigung wird nicht gespeichert. Es ist kein Fehler der Eingabe,
    // deshalb steht der Text der Meldung im Hinweis am Formular.
    const confirmDuplicate = options.confirmDuplicate || duplicateConfirmed;
    if (duplicateReported && !confirmDuplicate) {
      validationErrors.push('duplicateFirecallEntry');
    }
    setErrors(validationErrors);
    setSaveError(undefined);
    if (validationErrors.length > 0) return { success: false };

    setSaving(true);
    const result = await onSubmit(input, { confirmDuplicate });
    setSaving(false);
    if (!result.success) {
      // Die Server-Antwort ist auf der Gastseite die einzige Quelle für ein
      // Duplikat; gemerkt an der Kombination, damit die Bestätigung mit ihr
      // wieder verfällt.
      if (result.error === 'duplicateFirecallEntry' && duplicateKey) {
        setServerDuplicateKey(duplicateKey);
      }
      const known = TRANSLATED_SAVE_ERRORS.find((key) => key === result.error);
      setSaveError(
        known
          ? t(`errors.${known}` as 'errors.notInGroup')
          : t('errors.saveFailed', { message: result.error ?? '' }),
      );
    }
    return result;
  };

  return {
    vehicles,
    firecalls,
    /**
     * Ob es überhaupt eine Einsatzauswahl gibt. Bewusst an `undefined` geknüpft
     * und nicht an die Länge: eine leere Liste heißt „Auswahl vorhanden, aber
     * noch keine Einsätze geladen" und zeigt das Autocomplete-Feld leer,
     * `undefined` heißt „diese Oberfläche kennt keine Einsätze" (Gastformular)
     * und blendet das Feld ganz aus.
     */
    hasFirecallSelection: firecalls !== undefined,
    vehicle,
    definitions,
    selectedVehicleId,
    changeVehicle,
    driverName,
    driverId,
    changeDriver,
    coDrivers,
    changeCoDrivers,
    zweck,
    changeZweck,
    firecallId,
    firecallName,
    firecallInput,
    setFirecallInput,
    commitFirecallInput,
    changeFirecall,
    /**
     * Zweck `einsatz`, aber kein Einsatz verknüpft. Der Hinweis darauf ist
     * bewusst kein Fehler: Ein Einsatz einer anderen Feuerwehr steht nicht in
     * der Liste, und dann benennt die Fahrtstrecke die Fahrt. Ohne Verknüpfung
     * greifen nur die Duplikatsprüfungen nicht.
     */
    firecallLinkMissing: zweck === 'einsatz' && !firecallId,
    duplicateEntry,
    duplicateReported,
    duplicateConfirmed,
    setDuplicateConfirmed: (confirmed: boolean) =>
      setConfirmedDuplicateKey(confirmed ? duplicateKey : undefined),
    overlappingEntries,
    timeOrderInvalid,
    /** Ob der Knopf „Fahrtstrecke berechnen" überhaupt etwas ausrechnen kann. */
    canCalculateDistance: !!resolveDistance && !!firecallId,
    calculateDistance,
    distanceBusy,
    distanceResult,
    distanceError,
    zielCoveredByFirecall,
    ziel,
    setZiel,
    abfahrt,
    changeAbfahrt,
    ankunft,
    setAnkunft,
    counters,
    setCounters,
    lastCounters,
    betriebsmittel,
    setBetriebsmittel,
    hinweise,
    setHinweise,
    defekt,
    setDefekt,
    mangel,
    setMangel,
    errors,
    errorMessage,
    saveError,
    saving,
    submit,
  };
}
