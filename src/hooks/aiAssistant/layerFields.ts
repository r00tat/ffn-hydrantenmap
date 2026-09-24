import { computeAllFields } from '../../common/computeFieldValue';
import type {
  DataSchemaField,
  FirecallLayer,
} from '../../components/firebase/firestore';
import { findFirecallItemByName } from './itemLookup';

/**
 * Datenfelder einer Ebene per Sprache befüllen — „neue Messung 37 Millisievert
 * pro Stunde".
 *
 * Ohne React und ohne Leaflet, weil der Browser-Assistent und der MCP-Server
 * dieselben Handler benutzen.
 */

export type FieldValue = string | number | boolean;

/** Ein Wert, wie ihn das Modell übergibt: Feld, Wert und gesagte Einheit. */
export interface SpokenFieldValue {
  field?: string;
  value?: string | number | boolean;
  unit?: string;
}

/** Was das Modell von einer Ebene im Kontext sieht. */
export interface AiContextLayer {
  id: string;
  name: string;
  fields?: { key: string; label: string; unit?: string; type: string }[];
  /** Nur bei Messebenen: Zahl der Messpunkte, die nicht im Kontext stehen. */
  measurements?: number;
  /** Nur bei Messebenen: der jüngste Messpunkt. */
  latest?: { id: string; name: string; fieldData?: Record<string, FieldValue> };
}

export function projectLayer(layer: FirecallLayer): AiContextLayer {
  const fields = (layer.dataSchema ?? []).map((f) => ({
    key: f.key,
    label: f.label,
    ...(f.unit ? { unit: f.unit } : {}),
    type: f.type,
  }));
  return {
    id: layer.id!,
    name: layer.name,
    ...(fields.length > 0 ? { fields } : {}),
  };
}

/** Eine Ebene über ID oder gesprochenen Namen finden. */
export function findLayer(
  layers: FirecallLayer[],
  query: string | undefined,
): FirecallLayer | undefined {
  if (!query?.trim()) return undefined;
  const live = layers.filter((l) => !l.deleted);
  return (
    live.find((l) => l.id === query) ??
    (findFirecallItemByName(live, query) as FirecallLayer | undefined)
  );
}

/**
 * SI-Vorsätze, die in Messwerten vorkommen. „u" steht für µ, weil die
 * Spracherkennung und das Modell das µ gern verlieren.
 */
const PREFIXES: Record<string, number> = {
  n: 1e-9,
  µ: 1e-6,
  μ: 1e-6,
  u: 1e-6,
  m: 1e-3,
  '': 1,
  k: 1e3,
};

/** „mSv/h" → { factor: 1e-3, base: "sv/h" }. */
function splitUnit(unit: string): { factor: number; base: string }[] {
  const clean = unit.trim().replace(/\s+/g, '').toLocaleLowerCase('de');
  const options = [{ factor: 1, base: clean }];
  const prefix = clean[0];
  if (clean.length > 1 && prefix in PREFIXES) {
    options.push({ factor: PREFIXES[prefix], base: clean.slice(1) });
  }
  return options;
}

/**
 * Einen Wert von der gesagten in die Einheit des Feldes umrechnen. Nur über
 * SI-Vorsätze derselben Grundeinheit (mSv/h → µSv/h); alles andere ist nicht
 * umrechenbar und liefert `undefined`.
 */
export function convertUnit(
  value: number,
  from: string | undefined,
  to: string | undefined,
): number | undefined {
  if (!from?.trim() || !to?.trim()) return value;
  for (const a of splitUnit(from)) {
    for (const b of splitUnit(to)) {
      if (a.base === b.base) {
        // Auf 12 signifikante Stellen, damit 37 mSv/h nicht als
        // 36999.99999999999 µSv/h im Dokument landet.
        return Number(((value * a.factor) / b.factor).toPrecision(12));
      }
    }
  }
  return undefined;
}

function findField(
  schema: DataSchemaField[],
  name: string | undefined,
): DataSchemaField | undefined {
  const needle = name?.trim().toLocaleLowerCase('de');
  if (!needle) return undefined;
  return (
    schema.find((f) => f.key.toLocaleLowerCase('de') === needle) ??
    schema.find((f) => f.label.toLocaleLowerCase('de') === needle) ??
    schema.find((f) => f.label.toLocaleLowerCase('de').includes(needle))
  );
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const parsed = Number(value.trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  const text = String(value ?? '').trim().toLocaleLowerCase('de');
  if (['ja', 'true', 'wahr', '1', 'yes'].includes(text)) return true;
  if (['nein', 'false', 'falsch', '0', 'no'].includes(text)) return false;
  return undefined;
}

export interface AppliedFieldValues {
  fieldData: Record<string, FieldValue>;
  /** Für die Rückmeldung: „Dosisleistung 37000 µSv/h". */
  applied: string[];
  /** Was nicht ging, als fertige Sätze. Leer, wenn alles aufging. */
  errors: string[];
}

/**
 * Gesagte Werte in die Datenfelder einer Ebene übernehmen.
 *
 * Das Feld wird über Schlüssel oder Bezeichnung gefunden, Zahlen werden in die
 * Einheit des Feldes umgerechnet, berechnete Felder anschließend neu gerechnet
 * — genau wie beim Speichern im Dialog. Bei einem neuen Element gelten die
 * Vorgabewerte der Ebene für alles, was nicht gesagt wurde.
 */
export async function applyFieldValues(
  schema: DataSchemaField[],
  current: Record<string, FieldValue> | undefined,
  values: SpokenFieldValue[],
  { isNew = false }: { isNew?: boolean } = {},
): Promise<AppliedFieldValues> {
  const fieldData: Record<string, FieldValue> = { ...(current ?? {}) };
  const applied: string[] = [];
  const errors: string[] = [];

  if (isNew) {
    for (const f of schema) {
      if (f.defaultValue !== undefined && fieldData[f.key] === undefined) {
        fieldData[f.key] = f.defaultValue;
      }
    }
  }

  for (const spoken of values) {
    const field = findField(schema, spoken.field);
    if (!field) {
      errors.push(
        `Feld "${spoken.field ?? ''}" gibt es in dieser Ebene nicht` +
          (schema.length
            ? ` (Felder: ${schema.map((f) => f.label).join(', ')})`
            : ''),
      );
      continue;
    }
    if (field.type === 'computed') {
      errors.push(`"${field.label}" wird berechnet und lässt sich nicht setzen`);
      continue;
    }
    if (field.type === 'number') {
      const number = parseNumber(spoken.value);
      if (number === undefined) {
        errors.push(`"${spoken.value}" ist keine Zahl für "${field.label}"`);
        continue;
      }
      const converted = convertUnit(number, spoken.unit, field.unit);
      if (converted === undefined) {
        errors.push(
          `${spoken.unit} lässt sich nicht in ${field.unit} für "${field.label}" umrechnen`,
        );
        continue;
      }
      fieldData[field.key] = converted;
      applied.push(`${field.label} ${converted}${field.unit ? ` ${field.unit}` : ''}`);
    } else if (field.type === 'boolean') {
      const bool = parseBoolean(spoken.value);
      if (bool === undefined) {
        errors.push(`"${spoken.value}" ist weder ja noch nein für "${field.label}"`);
        continue;
      }
      fieldData[field.key] = bool;
      applied.push(`${field.label} ${bool ? 'ja' : 'nein'}`);
    } else {
      fieldData[field.key] = String(spoken.value ?? '');
      applied.push(`${field.label} ${fieldData[field.key]}`);
    }
  }

  const computed = await computeAllFields(fieldData, schema);
  for (const [key, value] of Object.entries(computed)) {
    fieldData[key] = value;
    const field = schema.find((f) => f.key === key);
    if (field) {
      applied.push(`${field.label} ${value}${field.unit ? ` ${field.unit}` : ''} (berechnet)`);
    }
  }

  return { fieldData, applied, errors };
}
