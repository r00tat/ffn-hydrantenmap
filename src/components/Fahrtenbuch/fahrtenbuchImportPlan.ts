/**
 * Bildet gelesene PDF-Zeilen (`fahrtenbuchPdfImport`) auf Eintragsentwürfe ab.
 * Rein — keine Firestore-Zugriffe, keine React-Abhängigkeiten. Ein
 * Fahrtenbuch ist ein Nachweisdokument: Von selbst wird nichts ergänzt oder
 * geschätzt, fehlt ein Pflichtwert, bleibt die Zeile ein Problem statt eines
 * Entwurfs. Was ein Mensch vor dem Import bewusst einträgt
 * (`ImportRowEdit`), gilt dagegen — er hat den Nachweis vor sich.
 */
import {
  arrivalFromTimeOnly,
  normalizeName,
  type CounterDefinition,
  type FahrtenbuchEntry,
  type FahrtenbuchPerson,
  type FahrtenbuchVehicle,
  type FahrtZweck,
  type FuelType,
} from '../../common/fahrtenbuch';
import type { FahrtenbuchEntryInput } from './entryLogic';
import { toIsoTimestamp, type PdfFahrtRow, type RowProblem } from './fahrtenbuchPdfImport';

export type ImportRowState = 'ready' | 'duplicate' | 'problem' | 'unknownDriver';

export type ImportProblem =
  | RowProblem
  | 'noKmCounter'
  | 'unreadable'
  | 'timeMismatch'
  | 'driverMissing'
  | 'zielMissing';

/**
 * Die wirksamen Werte einer Zeile. Vorschau, Entwurf und die Vorbelegung des
 * Bearbeiten-Dialogs speisen sich aus derselben Quelle — sonst zeigte die
 * Tabelle etwas anderes, als der Dialog zum Ändern anbietet.
 */
export interface ImportRowValues {
  driverName: string;
  zweck: FahrtZweck;
  ziel: string;
  /** ISO-Zeitstempel; leer, wenn Datum oder Uhrzeit nicht lesbar sind. */
  abfahrt: string;
  ankunft: string;
  startKm?: number;
  endeKm?: number;
  hinweise: string;
}

/**
 * Was jemand vor dem Import an einer Zeile geändert hat. Nur gesetzte Felder
 * wirken; `undefined` heißt „unverändert", nicht „geleert". Ein leerer String
 * ist dagegen eine echte Änderung — so lässt sich ein Ziel auch löschen.
 */
export type ImportRowEdit = Partial<ImportRowValues>;

export interface ImportPlanRow {
  line: number;
  state: ImportRowState;
  problem?: ImportProblem;
  /** Die Zeile weicht von der gelesenen ab — jemand hat sie angefasst. */
  edited: boolean;
  /** Fehlt genau dann, wenn `state === 'problem'`. */
  input?: FahrtenbuchEntryInput;
  /** Die wirksamen Werte — Vorbelegung des Bearbeiten-Dialogs. */
  values: ImportRowValues;
  preview: {
    datum: string;
    zeit: string;
    km: string;
  };
  /** Rohtext der Zeile — die Vorschau zeigt ihn bei einem Problem. */
  raw: string;
}

/**
 * Der Kilometerzähler des Fahrzeugs. Die Einheit entscheidet, nicht die ID:
 * ein von Hand angelegter Zähler kann anders heißen als das Preset.
 */
export function findKmCounter(
  counters: CounterDefinition[],
): CounterDefinition | undefined {
  return (
    counters.find((c) => c.unit === 'km') ?? counters.find((c) => c.id === 'km')
  );
}

/**
 * Die Kraftstoffart, in die die Spalte „Treibstoff" fällt. Die Quelle nennt
 * sie nicht; genommen wird die erste Art des Fahrzeugs, die nicht AdBlue ist.
 */
export function defaultFuelType(
  fuelTypes: FuelType[] = [],
): FuelType | undefined {
  return fuelTypes.find((f) => f !== 'adblue');
}

/** Abbildung der Grund-Spalte. Alles Unbekannte wird „Sonstiges". */
const ZWECK_BY_GRUND: Record<string, FahrtZweck> = {
  einsatz: 'einsatz',
  übung: 'uebung',
  uebung: 'uebung',
  versorgung: 'versorgung',
  versorgungsfahrt: 'versorgung',
  sonstiges: 'sonstiges',
};

export function mapGrund(grund: string): {
  zweck: FahrtZweck;
  /** Gesetzt, wenn der Begriff im Zweck nicht aufgeht und ins Ziel gehört. */
  prefix?: string;
} {
  const text = grund.trim();
  const zweck = ZWECK_BY_GRUND[text.toLowerCase()];
  if (zweck) return { zweck };
  // „Werkstatt", „Probefahrt" und alles Weitere: der Begriff ginge sonst
  // verloren, deshalb steht er vor dem Ziel.
  return { zweck: 'sonstiges', prefix: text || undefined };
}

/** Kalendertag eines ISO-Zeitstempels in Ortszeit — Schlüssel für Dubletten. */
function localDayKey(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * `dd.mm.yyyy` und `HH:MM` aus einem ISO-Zeitstempel. Bewusst von Hand statt
 * über `toLocaleDateString`: Die Vorschau soll dasselbe Format zeigen wie die
 * Quelle, unabhängig von der Sprache des Browsers.
 */
function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Die Werte, wie sie aus dem PDF gelesen wurden — ohne jede Bearbeitung. */
function baseValues(row: PdfFahrtRow): ImportRowValues {
  const { zweck, prefix } = mapGrund(row.grund);
  const abfahrt = row.von ? (toIsoTimestamp(row.datum, row.von) ?? '') : '';
  const bis = row.bis ? toIsoTimestamp(row.datum, row.bis) : undefined;
  return {
    driverName: row.fahrer.trim(),
    zweck,
    ziel: [prefix, row.zweckStrecke].filter(Boolean).join(': '),
    abfahrt,
    // Über `arrivalFromTimeOnly`, damit eine Ankunft vor der Abfahrt auf den
    // Folgetag rollt — im Beispielexport betrifft das vier Fahrten.
    ankunft: abfahrt && bis ? arrivalFromTimeOnly(abfahrt, new Date(bis)) : '',
    startKm: row.startKm,
    endeKm: row.endeKm,
    hinweise: row.notizen ?? '',
  };
}

const VALUE_KEYS = [
  'driverName',
  'zweck',
  'ziel',
  'abfahrt',
  'ankunft',
  'startKm',
  'endeKm',
  'hinweise',
] as const;

function mergeValues(
  base: ImportRowValues,
  edit: ImportRowEdit | undefined,
): ImportRowValues {
  if (!edit) return base;
  const merged = { ...base };
  for (const key of VALUE_KEYS) {
    const value = edit[key];
    if (value !== undefined) {
      // Der Schlüssel bestimmt auf beiden Seiten denselben Typ; TypeScript
      // löst das über die Vereinigung aller Schlüssel nicht auf.
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  // Wird nur die Abfahrt verschoben, behält die Ankunft ihre Uhrzeit und folgt
  // dem neuen Kalendertag — sonst läge sie einen Tag vor der Abfahrt.
  if (edit.abfahrt && edit.ankunft === undefined && base.ankunft) {
    merged.ankunft = arrivalFromTimeOnly(merged.abfahrt, new Date(base.ankunft));
  }
  return merged;
}

function differs(base: ImportRowValues, merged: ImportRowValues): boolean {
  return VALUE_KEYS.some((key) => base[key] !== merged[key]);
}

/**
 * Was die Zeile am Import hindert — nach der Bearbeitung beurteilt. Die
 * Meldungen des Parsers gelten nur so weit, wie sie durch die Bearbeitung
 * nicht gegenstandslos geworden sind.
 */
function rowProblem(
  row: PdfFahrtRow,
  values: ImportRowValues,
  kmEdited: boolean,
): ImportProblem | undefined {
  if (!values.driverName.trim()) return 'driverMissing';
  // Ein Import kennt keinen verknüpften Einsatz — bleibt die Spalte
  // „Zweck/Strecke" leer, ist die Zeile über den Bearbeiten-Dialog zu
  // vervollständigen. Ohne die Prüfung scheiterte erst der Schreibvorgang.
  if (!values.ziel.trim()) return 'zielMissing';
  if (!values.abfahrt || !values.ankunft) {
    return row.problem === 'dateInvalid' || row.problem === 'timeMissing'
      ? row.problem
      : 'unreadable';
  }
  if (new Date(values.ankunft) < new Date(values.abfahrt)) return 'timeMismatch';
  if (values.startKm === undefined || values.endeKm === undefined) {
    return 'kmMissing';
  }
  if (values.endeKm < values.startKm) return 'kmMismatch';
  // Die Selbstprüfung des Parsers („Ende − Start == Gef.") gilt nur für
  // unangetastete Kilometer: Hat jemand sie von Hand gesetzt, ist die
  // mitgelesene Differenz der Quelle nicht mehr der Maßstab.
  if (row.problem === 'kmMismatch' && !kmEdited) return 'kmMismatch';
  return undefined;
}

export interface ImportPlanOptions {
  /** Kraftstoffart für die Spalte „Treibstoff"; sonst die Vorgabe des Fahrzeugs. */
  fuelType?: FuelType;
  /** Bearbeitungen je Zeilennummer (`PdfFahrtRow.line`). */
  edits?: Record<number, ImportRowEdit>;
}

/**
 * Baut aus den gelesenen Zeilen die Eintragsentwürfe. Von selbst wird nichts
 * ergänzt oder geschätzt: Fehlt ein Pflichtwert, bleibt die Zeile ein Problem.
 * Ein Fahrtenbuch ist ein Nachweisdokument, und ein importierter
 * Kilometerstand, den niemand abgelesen hat, wäre eine Behauptung. Trägt ihn
 * jemand über `options.edits` ein, ist er abgelesen — dann zählt er.
 */
export function planFahrtenbuchImport(
  rows: PdfFahrtRow[],
  vehicle: FahrtenbuchVehicle,
  persons: FahrtenbuchPerson[],
  existing: FahrtenbuchEntry[],
  options: ImportPlanOptions = {},
): ImportPlanRow[] {
  const kmCounter = findKmCounter(vehicle.counters ?? []);
  const fuel = options.fuelType ?? defaultFuelType(vehicle.fuelTypes);
  const personByName = new Map(
    persons
      .filter((p) => p.id)
      .map((p) => [normalizeName(p.name), p as FahrtenbuchPerson & { id: string }]),
  );

  // Bestand einmal indizieren statt je Zeile zu suchen.
  const taken = new Set(
    existing
      .filter((e) => !e.deleted && e.vehicleId === vehicle.id)
      .map((e) => {
        const start = kmCounter ? e.counters?.[kmCounter.id]?.start : undefined;
        return `${localDayKey(e.abfahrt)}|${start ?? ''}`;
      }),
  );

  return rows.map((row) => {
    const base = baseValues(row);
    const edit = options.edits?.[row.line];
    const values = mergeValues(base, edit);
    const edited = differs(base, values);

    const common = {
      line: row.line,
      edited,
      values,
      preview: {
        datum: values.abfahrt ? formatDay(values.abfahrt) : row.datum,
        zeit:
          values.abfahrt && values.ankunft
            ? `${formatTime(values.abfahrt)} - ${formatTime(values.ankunft)}`
            : '',
        km:
          values.startKm !== undefined && values.endeKm !== undefined
            ? `${values.startKm} → ${values.endeKm}`
            : '',
      },
      raw: row.raw,
    };

    if (!kmCounter) {
      return { ...common, state: 'problem' as const, problem: 'noKmCounter' as const };
    }
    const problem = rowProblem(
      row,
      values,
      values.startKm !== base.startKm || values.endeKm !== base.endeKm,
    );
    if (problem) return { ...common, state: 'problem' as const, problem };

    const person = personByName.get(normalizeName(values.driverName));
    const betriebsmittel: Partial<Record<FuelType, number>> = {};
    if (row.treibstoff !== undefined && fuel) betriebsmittel[fuel] = row.treibstoff;
    if (row.adBlue !== undefined && (vehicle.fuelTypes ?? []).includes('adblue')) {
      betriebsmittel.adblue = row.adBlue;
    }

    const input: FahrtenbuchEntryInput = {
      vehicleId: vehicle.id as string,
      driverId: person?.id,
      driverName: person?.name ?? values.driverName.trim(),
      zweck: values.zweck,
      ziel: values.ziel,
      abfahrt: values.abfahrt,
      ankunft: values.ankunft,
      counters: {
        [kmCounter.id]: { start: values.startKm, end: values.endeKm },
      },
      betriebsmittel,
      hinweise: values.hinweise || undefined,
    };

    if (taken.has(`${localDayKey(values.abfahrt)}|${values.startKm}`)) {
      return { ...common, state: 'duplicate' as const, input };
    }
    if (!person) {
      return { ...common, state: 'unknownDriver' as const, input };
    }
    return { ...common, state: 'ready' as const, input };
  });
}

/**
 * Die Fahrernamen der ausgewählten Zeilen, für die es keine Person gibt —
 * jeder Name genau einmal, in der Reihenfolge des Auftretens. Für sie legt der
 * Import deaktivierte Personen an: Ein Fahrtenbuch von vor zwei Jahren nennt
 * Fahrer, die längst ausgetreten sind. Ohne Person hinge die Fahrt an einem
 * bloßen Namen, mit einer aktiven Person stünde ein Ausgetretener wieder zur
 * Auswahl.
 */
export function unknownDriverNames(rows: ImportPlanRow[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const row of rows) {
    if (row.state !== 'unknownDriver' || !row.input) continue;
    const name = row.input.driverName.trim();
    const key = normalizeName(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

export interface InactivePersonPlan {
  /** Namen, für die eine Person angelegt werden muss. */
  create: string[];
  /** Normalisierter Name → ID der bereits vorhandenen Person. */
  existing: Record<string, string>;
}

/**
 * Teilt die gemeldeten Fahrernamen in „gibt es schon" und „muss angelegt
 * werden". Verglichen wird über `normalizeName`, also so, wie auch die Vorschau
 * Fahrer und Person zusammenbringt — sonst legte der Import eine zweite Person
 * für einen Namen an, den er selbst als Treffer anzeigt.
 */
export function planInactivePersons(
  names: string[],
  persons: FahrtenbuchPerson[],
): InactivePersonPlan {
  const byName = new Map(
    persons
      .filter((p) => p.id)
      .map((p) => [normalizeName(p.name), p.id as string]),
  );
  const create: string[] = [];
  const existing: Record<string, string> = {};
  const seen = new Set<string>();
  for (const raw of names) {
    const name = (raw ?? '').trim();
    const key = normalizeName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const id = byName.get(key);
    if (id) existing[key] = id;
    else create.push(name);
  }
  return { create, existing };
}
