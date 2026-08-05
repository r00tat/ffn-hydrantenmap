/**
 * Bildet gelesene PDF-Zeilen (`fahrtenbuchPdfImport`) auf Eintragsentwürfe ab.
 * Rein — keine Firestore-Zugriffe, keine React-Abhängigkeiten. Ein
 * Fahrtenbuch ist ein Nachweisdokument: Nichts wird ergänzt oder geschätzt,
 * fehlt ein Pflichtwert, bleibt die Zeile ein Problem statt eines Entwurfs.
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

export type ImportProblem = RowProblem | 'noKmCounter' | 'unreadable';

export interface ImportPlanRow {
  line: number;
  state: ImportRowState;
  problem?: ImportProblem;
  /** Fehlt genau dann, wenn `state === 'problem'`. */
  input?: FahrtenbuchEntryInput;
  preview: {
    datum: string;
    zeit: string;
    fahrer: string;
    zweck: string;
    ziel: string;
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

export interface ImportPlanOptions {
  /** Kraftstoffart für die Spalte „Treibstoff"; sonst die Vorgabe des Fahrzeugs. */
  fuelType?: FuelType;
}

/**
 * Baut aus den gelesenen Zeilen die Eintragsentwürfe. Nichts wird ergänzt oder
 * geschätzt: Fehlt ein Pflichtwert, bleibt die Zeile ein Problem. Ein
 * Fahrtenbuch ist ein Nachweisdokument, und ein importierter Kilometerstand,
 * den niemand abgelesen hat, wäre eine Behauptung.
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
    const { zweck, prefix } = mapGrund(row.grund);
    const ziel = [prefix, row.zweckStrecke].filter(Boolean).join(': ');
    const preview = {
      datum: row.datum,
      zeit: row.von && row.bis ? `${row.von} - ${row.bis}` : '',
      fahrer: row.fahrer,
      zweck: prefix ?? row.grund,
      ziel,
      km:
        row.startKm !== undefined && row.endeKm !== undefined
          ? `${row.startKm} → ${row.endeKm}`
          : '',
    };
    const base = { line: row.line, preview, raw: row.raw };

    if (!kmCounter) {
      return { ...base, state: 'problem' as const, problem: 'noKmCounter' as const };
    }
    if (row.problem) {
      return { ...base, state: 'problem' as const, problem: row.problem };
    }

    const abfahrt = toIsoTimestamp(row.datum, row.von as string);
    if (!abfahrt || row.startKm === undefined || row.endeKm === undefined) {
      return { ...base, state: 'problem' as const, problem: 'unreadable' as const };
    }
    // Über `arrivalFromTimeOnly`, damit eine Ankunft vor der Abfahrt auf den
    // Folgetag rollt — im Beispielexport betrifft das vier Fahrten.
    const ankunft = arrivalFromTimeOnly(
      abfahrt,
      new Date(toIsoTimestamp(row.datum, row.bis as string) as string),
    );

    const person = personByName.get(normalizeName(row.fahrer));
    const betriebsmittel: Partial<Record<FuelType, number>> = {};
    if (row.treibstoff !== undefined && fuel) betriebsmittel[fuel] = row.treibstoff;
    if (row.adBlue !== undefined && (vehicle.fuelTypes ?? []).includes('adblue')) {
      betriebsmittel.adblue = row.adBlue;
    }

    const input: FahrtenbuchEntryInput = {
      vehicleId: vehicle.id as string,
      driverId: person?.id,
      driverName: person?.name ?? row.fahrer,
      zweck,
      ziel,
      abfahrt,
      ankunft,
      counters: { [kmCounter.id]: { start: row.startKm, end: row.endeKm } },
      betriebsmittel,
      hinweise: row.notizen || undefined,
    };

    if (taken.has(`${localDayKey(abfahrt)}|${row.startKm}`)) {
      return { ...base, state: 'duplicate' as const, input };
    }
    if (!person) {
      return { ...base, state: 'unknownDriver' as const, input };
    }
    return { ...base, state: 'ready' as const, input };
  });
}
