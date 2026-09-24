import type { DataSchemaField, FirecallItem } from '../../components/firebase/firestore';
import { slugify } from '../../components/firebase/importUtils';
import { findField, parseBoolean, parseNumber } from './layerFields';

/**
 * Datenfelder einer Ebene per Sprache anlegen, ändern und entfernen —
 * „Lege eine Ebene Strahlenmessung an mit Dosisleistung in Mikrosievert pro
 * Stunde".
 *
 * Dieselben Regeln wie der `DataSchemaEditor`: Der Schlüssel entsteht aus der
 * Bezeichnung und bleibt danach stehen, weil die Werte der Elemente an ihm
 * hängen; Formeln rechnen nur mit Feldern, die nicht selbst berechnet sind.
 */

export const FIELD_TYPES: DataSchemaField['type'][] = ['number', 'text', 'boolean', 'computed'];

/** Ein Feld, wie es das Modell beschreibt. */
export interface SpokenFieldSpec {
  /** Vorhandenes Feld (Schlüssel oder Bezeichnung), das geändert wird. */
  field?: string;
  label?: string;
  unit?: string;
  type?: string;
  formula?: string;
  defaultValue?: string | number | boolean;
}

export interface LayerSchemaChange {
  fields?: SpokenFieldSpec[];
  removeFields?: string[];
}

export interface EditedLayerSchema {
  schema: DataSchemaField[];
  /** Für die Rückmeldung: „Feld Dosisleistung (µSv/h) angelegt". */
  changes: string[];
  /** Was nicht ging, als fertige Sätze. Leer, wenn alles aufging. */
  errors: string[];
}

function fehlt(name: string, schema: DataSchemaField[]): string {
  return (
    `Feld "${name}" gibt es in dieser Ebene nicht` +
    (schema.length ? ` (Felder: ${schema.map((f) => f.label).join(', ')})` : '')
  );
}

function uniqueKey(label: string, schema: DataSchemaField[]): string {
  const base = slugify(label) || 'feld';
  const keys = new Set(schema.map((f) => f.key));
  if (!keys.has(base)) return base;
  let n = 2;
  while (keys.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

function parseDefault(
  value: SpokenFieldSpec['defaultValue'],
  type: DataSchemaField['type'],
): string | number | boolean | undefined {
  if (value === undefined || value === '') return undefined;
  if (type === 'number') return parseNumber(value);
  if (type === 'boolean') return parseBoolean(value);
  if (type === 'text') return String(value);
  return undefined;
}

function mitEinheit(field: DataSchemaField): string {
  return field.unit ? `${field.label} (${field.unit})` : field.label;
}

/** Wie viele Elemente einen Wert in diesem Feld tragen. */
function mitWerten(items: FirecallItem[], key: string): number {
  return items.filter((i) => !i.deleted && i.fieldData?.[key] !== undefined).length;
}

/**
 * Prüft jede Formel gegen die Felder, mit denen sie rechnen darf. Namen von
 * mathjs (Funktionen wie `sqrt`, Konstanten wie `pi`) sind erlaubt.
 */
async function formelFehler(schema: DataSchemaField[]): Promise<string[]> {
  const computed = schema.filter((f) => f.type === 'computed');
  if (computed.length === 0) return [];
  const mathjs = await import('mathjs');
  const keys = schema.filter((f) => f.type !== 'computed').map((f) => f.key);
  const felder = keys.length ? keys.join(', ') : 'keine';
  const errors: string[] = [];
  for (const field of computed) {
    const formula = field.formula ?? '';
    let unknown: string[];
    try {
      const names = new Set<string>();
      mathjs.parse(formula).traverse((node, path, parent) => {
        if (!(node as { isSymbolNode?: boolean }).isSymbolNode) return;
        if ((parent as { isFunctionNode?: boolean } | null)?.isFunctionNode && path === 'fn') return;
        names.add((node as unknown as { name: string }).name);
      });
      unknown = [...names].filter((n) => !keys.includes(n) && !(n in mathjs));
    } catch {
      errors.push(`Formel "${formula}" von "${field.label}" ist nicht lesbar`);
      continue;
    }
    if (unknown.length) {
      errors.push(
        `Formel "${formula}" von "${field.label}" kennt ${unknown
          .map((n) => `"${n}"`)
          .join(', ')} nicht (Felder: ${felder})`,
      );
    }
  }
  return errors;
}

export async function editLayerSchema(
  current: DataSchemaField[],
  change: LayerSchemaChange,
  items: FirecallItem[] = [],
): Promise<EditedLayerSchema> {
  let schema = current.map((f) => ({ ...f }));
  const changes: string[] = [];
  const errors: string[] = [];

  for (const name of change.removeFields ?? []) {
    const field = findField(schema, name);
    if (!field) {
      errors.push(fehlt(name, schema));
      continue;
    }
    schema = schema.filter((f) => f !== field);
    changes.push(`Feld ${field.label} entfernt`);
  }

  for (const spec of change.fields ?? []) {
    const type = spec.type?.trim().toLowerCase();
    if (type && !FIELD_TYPES.includes(type as DataSchemaField['type'])) {
      errors.push(`Typ "${spec.type}" gibt es nicht (Typen: ${FIELD_TYPES.join(', ')})`);
      continue;
    }

    const target = spec.field
      ? findField(schema, spec.field)
      : spec.label
        ? schema.find(
            (f) => f.label.toLocaleLowerCase('de') === spec.label!.trim().toLocaleLowerCase('de'),
          )
        : undefined;
    if (spec.field && !target) {
      errors.push(fehlt(spec.field, schema));
      continue;
    }

    if (!target) {
      const label = spec.label?.trim();
      if (!label) {
        errors.push('Ein neues Feld braucht eine Bezeichnung');
        continue;
      }
      const fieldType = (type ?? (spec.formula ? 'computed' : 'number')) as DataSchemaField['type'];
      if (fieldType === 'computed' && !spec.formula?.trim()) {
        errors.push(`"${label}" ist berechnet und braucht eine Formel`);
        continue;
      }
      const field: DataSchemaField = {
        key: uniqueKey(label, schema),
        label,
        unit: spec.unit?.trim() ?? '',
        type: fieldType,
      };
      if (fieldType === 'computed') field.formula = spec.formula!.trim();
      const defaultValue = parseDefault(spec.defaultValue, fieldType);
      if (defaultValue !== undefined) field.defaultValue = defaultValue;
      schema.push(field);
      changes.push(`Feld ${mitEinheit(field)} angelegt`);
      continue;
    }

    // Ein vorhandenes Feld ändern. Einheit und Typ bleiben, sobald Elemente
    // Werte tragen: Aus 5 µSv/h würden sonst stillschweigend 5 mSv/h.
    const nextType = (type ?? (spec.formula ? 'computed' : target.type)) as DataSchemaField['type'];
    const unit = spec.unit?.trim();
    const unitChanged = unit !== undefined && unit !== target.unit;
    const typeChanged = nextType !== target.type;
    if (unitChanged || typeChanged) {
      const count = mitWerten(items, target.key);
      if (count > 0) {
        errors.push(
          `${unitChanged ? 'Einheit' : 'Typ'} von "${target.label}" bleibt: ` +
            `${count} ${count === 1 ? 'Element hat' : 'Elemente haben'} schon Werte` +
            (target.unit ? ` in ${target.unit}` : ''),
        );
        continue;
      }
    }
    if (nextType === 'computed' && !(spec.formula ?? target.formula)?.trim()) {
      errors.push(`"${target.label}" ist berechnet und braucht eine Formel`);
      continue;
    }

    const parts: string[] = [];
    const updated: DataSchemaField = { ...target };
    const label = spec.label?.trim();
    if (label && label !== target.label) {
      updated.label = label;
      parts.push(`Bezeichnung ${label}`);
    }
    if (unitChanged) {
      updated.unit = unit!;
      parts.push(`Einheit ${unit || 'keine'}`);
    }
    if (typeChanged) {
      updated.type = nextType;
      parts.push(`Typ ${nextType}`);
      if (nextType !== 'computed') delete updated.formula;
      delete updated.defaultValue;
    }
    if (nextType === 'computed' && spec.formula?.trim() && spec.formula.trim() !== target.formula) {
      updated.formula = spec.formula.trim();
      parts.push(`Formel ${updated.formula}`);
    }
    const defaultValue = parseDefault(spec.defaultValue, nextType);
    if (defaultValue !== undefined && defaultValue !== target.defaultValue) {
      updated.defaultValue = defaultValue;
      parts.push(`Vorgabe ${defaultValue}`);
    }
    if (parts.length === 0) continue;
    schema = schema.map((f) => (f === target ? updated : f));
    changes.push(`Feld ${target.label}: ${parts.join(', ')}`);
  }

  errors.push(...(await formelFehler(schema)));
  return { schema, changes, errors };
}
