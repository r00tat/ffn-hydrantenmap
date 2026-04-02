import { describe, it, expect } from 'vitest';
import { evaluateFormula, computeAllFields } from './computeFieldValue';
import { DataSchemaField } from '../components/firebase/firestore';

describe('evaluateFormula', () => {
  it('evaluates simple multiplication', async () => {
    const result = await evaluateFormula('dosisleistung * 0.3', {
      dosisleistung: 123,
    });
    expect(result).toBeCloseTo(36.9);
  });

  it('evaluates addition', async () => {
    const result = await evaluateFormula('a + b', { a: 10, b: 20 });
    expect(result).toBe(30);
  });

  it('evaluates complex formula with parentheses', async () => {
    const result = await evaluateFormula('(a + b) * 2', { a: 5, b: 3 });
    expect(result).toBe(16);
  });

  it('evaluates division', async () => {
    const result = await evaluateFormula('wert / 10', { wert: 100 });
    expect(result).toBe(10);
  });

  it('returns undefined when a referenced field is missing', async () => {
    const result = await evaluateFormula('dosisleistung * 0.3', {});
    expect(result).toBeUndefined();
  });

  it('returns undefined when a referenced field is not a number', async () => {
    const result = await evaluateFormula('name * 2', { name: 'hello' });
    expect(result).toBeUndefined();
  });

  it('handles mathematical functions (sqrt)', async () => {
    const result = await evaluateFormula('sqrt(wert)', { wert: 16 });
    expect(result).toBe(4);
  });

  it('handles power function', async () => {
    const result = await evaluateFormula('wert ^ 2', { wert: 3 });
    expect(result).toBe(9);
  });

  it('returns undefined for invalid formula syntax', async () => {
    const result = await evaluateFormula('** invalid', { a: 1 });
    expect(result).toBeUndefined();
  });

  it('returns undefined for empty formula', async () => {
    const result = await evaluateFormula('', { a: 1 });
    expect(result).toBeUndefined();
  });

  it('handles boolean field values (treats true as 1, false as 0)', async () => {
    const result = await evaluateFormula('flag * 10', { flag: true });
    expect(result).toBe(10);
  });

  it('ignores string fields in fieldData', async () => {
    const result = await evaluateFormula('a + 1', { a: 5, name: 'test' });
    expect(result).toBe(6);
  });
});

describe('computeAllFields', () => {
  const schema: DataSchemaField[] = [
    { key: 'dosisleistung', label: 'Dosisleistung', unit: 'µSv/h', type: 'number' },
    {
      key: 'berechnet',
      label: 'Berechneter Wert',
      unit: 'µSv',
      type: 'computed',
      formula: 'dosisleistung * 0.3',
    },
  ];

  it('computes all computed fields', async () => {
    const result = await computeAllFields({ dosisleistung: 100 }, schema);
    expect(result).toEqual({ berechnet: 30 });
  });

  it('returns empty object when source field is missing', async () => {
    const result = await computeAllFields({}, schema);
    expect(result).toEqual({});
  });

  it('does not include non-computed fields', async () => {
    const result = await computeAllFields({ dosisleistung: 100 }, schema);
    expect(result).not.toHaveProperty('dosisleistung');
  });

  it('handles multiple computed fields', async () => {
    const multiSchema: DataSchemaField[] = [
      { key: 'a', label: 'A', unit: '', type: 'number' },
      { key: 'b', label: 'B', unit: '', type: 'number' },
      { key: 'sum', label: 'Sum', unit: '', type: 'computed', formula: 'a + b' },
      { key: 'product', label: 'Product', unit: '', type: 'computed', formula: 'a * b' },
    ];
    const result = await computeAllFields({ a: 3, b: 4 }, multiSchema);
    expect(result).toEqual({ sum: 7, product: 12 });
  });

  it('skips computed fields with no formula', async () => {
    const noFormulaSchema: DataSchemaField[] = [
      { key: 'a', label: 'A', unit: '', type: 'number' },
      { key: 'calc', label: 'Calc', unit: '', type: 'computed' },
    ];
    const result = await computeAllFields({ a: 5 }, noFormulaSchema);
    expect(result).toEqual({});
  });
});
