import { describe, expect, it } from 'vitest';
import { normalizeSchemaTypes } from '../../common/aiLiveToken';
import { AI_SYSTEM_PROMPT, AI_TOOL_DECLARATIONS } from './aiTools';

/** Die Schema-Typen, die die Gemini-API kennt — großgeschrieben wie im Draht. */
const SCHEMA_TYPES = new Set([
  'STRING',
  'NUMBER',
  'INTEGER',
  'BOOLEAN',
  'ARRAY',
  'OBJECT',
]);

/**
 * Die Felder, die ein `Schema` der Gemini-API tragen darf. Alles andere quittiert
 * sie mit „Unknown name" — und das erst beim Prägen des Tokens.
 */
const SCHEMA_KEYS = new Set([
  'type',
  'format',
  'title',
  'description',
  'nullable',
  'enum',
  'maxItems',
  'minItems',
  'properties',
  'required',
  'minProperties',
  'maxProperties',
  'minLength',
  'maxLength',
  'pattern',
  'example',
  'anyOf',
  'propertyOrdering',
  'default',
  'items',
  'minimum',
  'maximum',
]);

interface LooseSchema {
  type?: unknown;
  properties?: Record<string, LooseSchema>;
  items?: LooseSchema;
  required?: string[];
  enum?: unknown[];
  [key: string]: unknown;
}

/** Sammelt die Regelverstöße eines Schemas samt Pfad, statt beim ersten zu enden. */
function schemaViolations(schema: LooseSchema, path: string): string[] {
  const problems: string[] = [];

  for (const key of Object.keys(schema)) {
    if (!SCHEMA_KEYS.has(key)) {
      problems.push(`${path}: unbekanntes Feld „${key}"`);
    }
  }

  const type = schema.type;
  if (typeof type !== 'string' || !SCHEMA_TYPES.has(type)) {
    problems.push(`${path}: Typ fehlt oder ist unbekannt (${String(type)})`);
    return problems;
  }

  if (schema.enum && type !== 'STRING') {
    problems.push(`${path}: enum gibt es nur an STRING, nicht an ${type}`);
  }

  if (type === 'ARRAY') {
    if (!schema.items) {
      problems.push(`${path}: ARRAY ohne items`);
    } else {
      problems.push(...schemaViolations(schema.items, `${path}[]`));
    }
  }

  if (type === 'OBJECT') {
    const properties = schema.properties;
    if (!properties || Object.keys(properties).length === 0) {
      problems.push(`${path}: OBJECT ohne properties`);
    } else {
      for (const [name, property] of Object.entries(properties)) {
        problems.push(...schemaViolations(property, `${path}.${name}`));
      }
      for (const name of schema.required ?? []) {
        if (!(name in properties)) {
          problems.push(`${path}: required nennt „${name}", das es nicht gibt`);
        }
      }
    }
  }

  return problems;
}

/**
 * Diese Tests hüten den Vertrag zwischen Prompt und Werkzeugen. Ein Bruch
 * äußert sich sonst nur darin, dass das Modell ein Werkzeug nicht mehr
 * benutzt — ohne Fehler, ohne Log, ohne fehlschlagenden Test.
 */
describe('AI tool declarations', () => {
  /**
   * Die Deklarationen wandern in das kurzlebige Live-Token — und zwar
   * vollständig, weil das Token-Setup ohne `fieldMask` gilt. Ein Schema, das
   * die API nicht annimmt, lässt damit nicht ein Werkzeug ausfallen, sondern
   * den gesamten Sprachassistenten: `POST /v1beta/auth_tokens` antwortet mit
   * HTTP 400, es gibt kein Token, und die Karte fällt stumm auf den
   * Einzelaufruf zurück. Der Grund steht nur im Serverlog. Deshalb hier.
   */
  it('keeps every parameter schema within what the Gemini API accepts', () => {
    const declarations = normalizeSchemaTypes(
      AI_TOOL_DECLARATIONS as unknown as { name: string; parameters?: LooseSchema }[],
    );
    const problems = declarations.flatMap((declaration) =>
      declaration.parameters
        ? schemaViolations(declaration.parameters, declaration.name)
        : [],
    );
    expect(problems).toEqual([]);
  });

  it('has a unique, well-formed name for every tool', () => {
    const names = AI_TOOL_DECLARATIONS.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name).toMatch(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);
    }
  });

  it('describes every tool, because that is what the model selects on', () => {
    for (const declaration of AI_TOOL_DECLARATIONS) {
      expect(declaration.description.length).toBeGreaterThan(20);
    }
  });

  it('mentions every tool in the system prompt', () => {
    for (const { name } of AI_TOOL_DECLARATIONS) {
      expect(AI_SYSTEM_PROMPT).toContain(name);
    }
  });
});

describe('AI system prompt', () => {
  it('carves water supply questions out of the answerQuestion rule', () => {
    // Ohne diese Ausnahme gewinnt die frühere, allgemeinere Regel „Bei Fragen
    // … verwende answerQuestion" und „Wo ist der nächste Hydrant?" wird ohne
    // Datenabfrage beantwortet.
    const answerRule = AI_SYSTEM_PROMPT.slice(
      AI_SYSTEM_PROMPT.indexOf('Bei Fragen über den Einsatz'),
      AI_SYSTEM_PROMPT.indexOf('Bei Unklarheiten')
    );
    expect(answerRule).toContain('searchWaterSupply');
    expect(answerRule).toContain('Hydranten');
  });

  it('forbids answering about hydrants from the model’s own knowledge', () => {
    expect(AI_SYSTEM_PROMPT).toMatch(
      /kennst KEINE Hydranten[\s\S]*searchWaterSupply/
    );
  });

  it('tells the model that one search call is enough', () => {
    expect(AI_SYSTEM_PROMPT).toContain('searchWaterSupply EINMAL aufrufen');
  });
});
