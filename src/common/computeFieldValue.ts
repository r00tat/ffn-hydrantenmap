import { DataSchemaField } from '../components/firebase/firestore';

let _evaluate: typeof import('mathjs').evaluate | undefined;

async function loadEvaluate() {
  if (!_evaluate) {
    const mathjs = await import('mathjs');
    _evaluate = mathjs.evaluate;
  }
  return _evaluate;
}

/**
 * Evaluate a formula string, substituting field keys with their values from fieldData.
 * Returns the numeric result, or undefined if the formula cannot be evaluated
 * (e.g. missing fields, syntax error, non-numeric result).
 */
export async function evaluateFormula(
  formula: string,
  fieldData: Record<string, string | number | boolean>
): Promise<number | undefined> {
  if (!formula || !formula.trim()) return undefined;

  try {
    const evaluate = await loadEvaluate();

    // Build a scope object with numeric values from fieldData
    const scope: Record<string, number> = {};
    for (const [key, value] of Object.entries(fieldData)) {
      if (typeof value === 'number') {
        scope[key] = value;
      } else if (typeof value === 'boolean') {
        scope[key] = value ? 1 : 0;
      }
      // Skip string values - they can't be used in math formulas
    }

    const result = evaluate(formula, scope);

    if (typeof result === 'number' && isFinite(result)) {
      return result;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Compute all computed fields in a schema based on the given fieldData.
 * Returns a record of computed field keys to their calculated values.
 * Only includes fields that could be successfully computed.
 */
export async function computeAllFields(
  fieldData: Record<string, string | number | boolean>,
  schema: DataSchemaField[]
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};

  for (const field of schema) {
    if (field.type !== 'computed' || !field.formula) continue;

    const value = await evaluateFormula(field.formula, fieldData);
    if (value !== undefined) {
      result[field.key] = value;
    }
  }

  return result;
}
