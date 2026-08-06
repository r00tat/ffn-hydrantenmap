'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  arrivalOnDepartureDay,
  referenceCounters,
  validateEntryInput,
  type CounterDefinition,
  type CounterReading,
  type FahrtenbuchEntry,
  type FahrtZweck,
  type FuelType,
} from '../../common/fahrtenbuch';
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
  onSubmit: (input: FahrtenbuchEntryInput) => Promise<EntryFormSubmitResult>;
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
 * Fehlerschlüssel, die die Server Actions unverändert zurückgeben.
 * `linkInvalid` kann nur über den Fahrtenbuch-Share-Link entstehen — der
 * eingeloggte Dialog bekommt ihn nie. Die Liste deckt beide Aufrufer ab.
 */
const TRANSLATED_SAVE_ERRORS = [
  'notAllowed',
  'notInGroup',
  'entryDeleted',
  'tooManyEntries',
  // Aus dem Share-Pfad: Er meldet ausschließlich diese vier Schlüssel, damit
  // keine internen Meldungen an anonyme Besucher gehen.
  'linkInvalid',
  'vehicleNotFound',
  'invalidEntry',
  'shareSaveFailed',
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
  onSubmit,
}: UseEntryFormStateOptions) {
  const t = useTranslations('fahrtenbuch');
  const [selectedVehicleId, setSelectedVehicleId] = useState(
    entry?.vehicleId ?? vehicleId ?? '',
  );
  const [driverName, setDriverName] = useState(entry?.driverName ?? '');
  const [driverId, setDriverId] = useState<string | undefined>(entry?.driverId);
  const [zweck, setZweck] = useState<FahrtZweck>(entry?.zweck ?? 'sonstiges');
  const [firecallId, setFirecallId] = useState<string | undefined>(
    entry?.firecallId,
  );
  // Getrennt von `firecallId`, weil ein frei eingegebener Einsatz keinen
  // Datensatz im System hat. Beim Bearbeiten kommt der Name aus dem Eintrag
  // und nicht aus der Einsatzliste — steht der verknüpfte Einsatz nicht mehr
  // in den geladenen 50, bliebe das Feld sonst leer.
  const [firecallName, setFirecallName] = useState(entry?.firecallName ?? '');
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
    setFirecallName(name);
    const firecall = id ? firecalls?.find((f) => f.id === id) : undefined;
    if (firecall?.date) setAbfahrt(firecall.date);
    if (firecall?.abruecken) setAnkunft(firecall.abruecken);
  };

  /** Name und zugehörige Personen-ID immer gemeinsam setzen — sonst zeigt
   *  `driverId` nach einer freien Eingabe noch auf die vorige Person. */
  const changeDriver = (name: string, id?: string) => {
    setDriverName(name);
    setDriverId(id);
  };

  const submit = async (): Promise<EntryFormSubmitResult> => {
    // Kein vehicleName: der Server leitet ihn aus dem geladenen Fahrzeug ab,
    // damit Name und Zähler nicht auseinanderlaufen können.
    const input: FahrtenbuchEntryInput = {
      vehicleId: selectedVehicleId,
      driverId,
      driverName,
      zweck,
      firecallId: zweck === 'einsatz' ? firecallId : undefined,
      firecallName:
        zweck === 'einsatz' ? firecallName.trim() || undefined : undefined,
      ziel,
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
    setErrors(validationErrors);
    setSaveError(undefined);
    if (validationErrors.length > 0) return { success: false };

    setSaving(true);
    const result = await onSubmit(input);
    setSaving(false);
    if (!result.success) {
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
    zweck,
    setZweck,
    firecallId,
    firecallName,
    changeFirecall,
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
