import {
  FUEL_TYPES,
  type CounterDefinition,
  type CounterReading,
  type FahrtenbuchEntry,
  type FahrtenbuchVehicle,
  type FuelType,
} from '../../common/fahrtenbuch';

/**
 * Eine Zeile der Zählerspalte in der Fahrtenliste.
 *
 * Beschriftung und Wert stehen getrennt, damit die Oberfläche die Beschriftung
 * übersetzen (`labelKey`) und optisch zurücknehmen kann. Ohne Beschriftung war
 * die Spalte bei einem Boot nicht zu lesen: „1 h · 2.1 h · 2.1 h" sagt nicht,
 * welcher Wert die Betriebsstunden und welcher die Lenzpumpen sind.
 */
export interface CounterLine {
  counterId: string;
  /** Preset-Schlüssel unter `fahrtenbuch.counters`; ohne den gilt `label`. */
  labelKey?: string;
  label: string;
  /** Der Stand: „12340 → 12362 km" bei Start/Ende, „2.1 h" bei einer Ablesung. */
  value: string;
  /** Die Differenz einer Start/Ende-Ablesung, etwa „+22 km". */
  diff?: string;
}

const withUnit = (text: string, unit: string): string => {
  const trimmed = unit.trim();
  return trimmed ? `${text} ${trimmed}` : text;
};

/**
 * Die Differenz auf zwei Dezimalstellen. `end - start` liefert in Fließkomma für
 * Betriebsstunden wie 1246,1 − 1245 den Wert 1,0999999999999943 — als
 * Tabellenwert unbrauchbar. Kilometerstände sind ganzzahlig und bleiben
 * unberührt.
 */
function roundDiff(value: number): number {
  return Math.round(value * 100) / 100;
}

function counterValue(
  mode: CounterDefinition['mode'],
  unit: string,
  reading: CounterReading,
): string | undefined {
  const { start, end } = reading;
  if (mode === 'startEnd' && start !== undefined && end !== undefined) {
    return withUnit(`${start} → ${end}`, unit);
  }
  if (end !== undefined) return withUnit(`${end}`, unit);
  // Nur ein Startstand: Die Fahrt ist erfasst, der Endstand fehlt noch (etwa
  // aus der Sammelerfassung ohne Route). Als „12340 → ?" ausgewiesen, damit die
  // Lücke nicht wie eine Ablesung aussieht.
  if (start !== undefined) return withUnit(`${start} → ?`, unit);
  return undefined;
}

function counterDiff(
  mode: CounterDefinition['mode'],
  unit: string,
  reading: CounterReading,
): string | undefined {
  if (mode !== 'startEnd') return undefined;
  const { start, end, diff } = reading;
  // Aus Start und Ende neu gerechnet, wenn beide da sind: Ein mitgeschlepptes
  // `diff` kann einer späteren Korrektur widersprechen.
  const value =
    start !== undefined && end !== undefined ? end - start : diff;
  if (value === undefined) return undefined;
  const rounded = roundDiff(value);
  return withUnit(`${rounded >= 0 ? '+' : ''}${rounded}`, unit);
}

/**
 * Die Zählerstände einer Fahrt, in der Reihenfolge der Zählerdefinitionen des
 * Fahrzeugs.
 *
 * Zähler, die der Eintrag mitbringt, für die das Fahrzeug aber keine Definition
 * mehr hat (etwa nach einem Wechsel der Zähler-Vorlage), werden am Ende ohne
 * Einheit angehängt. Ein Fahrtenbuch ist ein Nachweisdokument — erfasste Werte
 * dürfen nicht verschwinden, weil sich die Stammdaten geändert haben.
 */
export function counterLines(
  entry: Pick<FahrtenbuchEntry, 'counters'>,
  vehicle: Pick<FahrtenbuchVehicle, 'counters'> | undefined,
): CounterLine[] {
  const lines: CounterLine[] = [];
  const defined = new Set<string>();

  for (const def of vehicle?.counters ?? []) {
    defined.add(def.id);
    const reading = entry.counters?.[def.id];
    if (!reading) continue;
    const value = counterValue(def.mode, def.unit, reading);
    if (!value) continue;
    lines.push({
      counterId: def.id,
      labelKey: def.labelKey,
      label: def.label,
      value,
      diff: counterDiff(def.mode, def.unit, reading),
    });
  }

  for (const [id, reading] of Object.entries(entry.counters ?? {})) {
    if (defined.has(id) || !reading) continue;
    // Ohne Definition ist der Modus nicht bekannt: Ein Startstand macht die
    // Ablesung zu einem Start/Ende-Zähler, sonst bleibt es eine Ablesung.
    const mode = reading.start !== undefined ? 'startEnd' : 'reading';
    const value = counterValue(mode, '', reading);
    if (!value) continue;
    lines.push({
      counterId: id,
      label: id,
      value,
      diff: counterDiff(mode, '', reading),
    });
  }

  return lines;
}

/** Ein getanktes Betriebsmittel einer Fahrt. */
export interface FuelLine {
  fuel: FuelType;
  amount: number;
}

/**
 * Die getankten Betriebsmittel in der Reihenfolge von `FUEL_TYPES`. Nullmengen
 * fallen weg — „Diesel: 0" ist keine Tankung, sondern ein leer gelassenes Feld.
 */
export function fuelLines(
  entry: Pick<FahrtenbuchEntry, 'betriebsmittel'>,
): FuelLine[] {
  const lines: FuelLine[] = [];
  for (const fuel of FUEL_TYPES) {
    const amount = entry.betriebsmittel?.[fuel];
    if (typeof amount !== 'number' || !Number.isFinite(amount)) continue;
    if (amount <= 0) continue;
    lines.push({ fuel, amount });
  }
  return lines;
}
