import { describe, expect, it } from 'vitest';
import type { DataSchemaField, FirecallLayer } from '../../components/firebase/firestore';
import { applyFieldValues, convertUnit, findLayer, projectLayer } from './layerFields';

const schema: DataSchemaField[] = [
  { key: 'dosisleistung', label: 'Dosisleistung', unit: 'µSv/h', type: 'number' },
  { key: 'messgeraet', label: 'Messgerät', unit: '', type: 'text', defaultValue: 'Radiacode' },
  { key: 'kontaminiert', label: 'Kontaminiert', unit: '', type: 'boolean' },
  {
    key: 'dosis8h',
    label: 'Dosis 8 h',
    unit: 'µSv',
    type: 'computed',
    formula: 'dosisleistung * 8',
  },
];

describe('convertUnit', () => {
  it('rechnet über SI-Vorsätze derselben Grundeinheit', () => {
    expect(convertUnit(37, 'mSv/h', 'µSv/h')).toBe(37000);
    expect(convertUnit(250, 'µSv/h', 'mSv/h')).toBe(0.25);
    expect(convertUnit(2, 'Sv/h', 'mSv/h')).toBe(2000);
  });

  it('nimmt u für µ und ignoriert Groß- und Kleinschreibung der Grundeinheit', () => {
    expect(convertUnit(5, 'uSv/h', 'µSv/h')).toBe(5);
    expect(convertUnit(5, 'msv/h', 'µSv/h')).toBe(5000);
  });

  it('lässt den Wert ohne Einheit stehen', () => {
    expect(convertUnit(37, undefined, 'µSv/h')).toBe(37);
    expect(convertUnit(37, 'mSv/h', '')).toBe(37);
  });

  it('verweigert unverträgliche Einheiten', () => {
    expect(convertUnit(37, 'ppm', 'µSv/h')).toBeUndefined();
    expect(convertUnit(1, 'min', 'h')).toBeUndefined();
  });
});

describe('applyFieldValues', () => {
  it('findet das Feld über die Bezeichnung und rechnet die Einheit um', async () => {
    const result = await applyFieldValues(schema, undefined, [
      { field: 'Dosisleistung', value: '37', unit: 'mSv/h' },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.fieldData.dosisleistung).toBe(37000);
    expect(result.applied).toContain('Dosisleistung 37000 µSv/h');
  });

  it('rechnet berechnete Felder mit', async () => {
    const result = await applyFieldValues(schema, undefined, [
      { field: 'dosisleistung', value: '2,5' },
    ]);
    expect(result.fieldData.dosis8h).toBe(20);
  });

  it('setzt bei einem neuen Element die Vorgaben der Ebene', async () => {
    const neu = await applyFieldValues(schema, undefined, [], { isNew: true });
    expect(neu.fieldData.messgeraet).toBe('Radiacode');
    const alt = await applyFieldValues(schema, { dosisleistung: 1 }, []);
    expect(alt.fieldData.messgeraet).toBeUndefined();
  });

  it('behält bestehende Werte, die nicht gesagt wurden', async () => {
    const result = await applyFieldValues(
      schema,
      { dosisleistung: 10, messgeraet: 'Graetz' },
      [{ field: 'kontaminiert', value: 'ja' }],
    );
    expect(result.fieldData).toMatchObject({
      dosisleistung: 10,
      messgeraet: 'Graetz',
      kontaminiert: true,
    });
  });

  it('meldet unbekannte, berechnete und unlesbare Felder', async () => {
    const result = await applyFieldValues(schema, undefined, [
      { field: 'Temperatur', value: '20' },
      { field: 'dosis8h', value: '5' },
      { field: 'dosisleistung', value: 'viel' },
      { field: 'dosisleistung', value: '5', unit: 'ppm' },
    ]);
    expect(result.errors).toHaveLength(4);
    expect(result.errors[0]).toMatch(/Temperatur.*Felder: Dosisleistung/);
    expect(result.errors[1]).toMatch(/wird berechnet/);
    expect(result.errors[2]).toMatch(/keine Zahl/);
    expect(result.errors[3]).toMatch(/ppm lässt sich nicht in µSv\/h/);
  });
});

describe('findLayer und projectLayer', () => {
  const layers = [
    { id: 'l1', type: 'layer', name: 'Strahlenmessung', dataSchema: schema },
    { id: 'l2', type: 'layer', name: 'Abschnitt Nord' },
    { id: 'l3', type: 'layer', name: 'Alte Messung', deleted: true },
  ] as FirecallLayer[];

  it('findet über ID und Teil des Namens, aber keine gelöschte Ebene', () => {
    expect(findLayer(layers, 'l2')?.name).toBe('Abschnitt Nord');
    expect(findLayer(layers, 'strahlen')?.id).toBe('l1');
    expect(findLayer(layers, 'Alte Messung')).toBeUndefined();
    expect(findLayer(layers, undefined)).toBeUndefined();
  });

  it('gibt Felder ohne Formel und Vorgabe an das Modell', () => {
    expect(projectLayer(layers[0]).fields?.[0]).toEqual({
      key: 'dosisleistung',
      label: 'Dosisleistung',
      unit: 'µSv/h',
      type: 'number',
    });
    expect(projectLayer(layers[1])).toEqual({ id: 'l2', name: 'Abschnitt Nord' });
  });
});
