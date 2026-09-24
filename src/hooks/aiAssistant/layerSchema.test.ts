import { describe, expect, it } from 'vitest';
import type { DataSchemaField, FirecallItem } from '../../components/firebase/firestore';
import { editLayerSchema } from './layerSchema';

const dosis: DataSchemaField = {
  key: 'dosisleistung',
  label: 'Dosisleistung',
  unit: 'µSv/h',
  type: 'number',
};

describe('editLayerSchema — Felder anlegen', () => {
  it('leitet den Schlüssel aus der Bezeichnung ab und nimmt Zahl als Vorgabe', async () => {
    const result = await editLayerSchema([], {
      fields: [{ label: 'Dosisleistung', unit: 'µSv/h' }, { label: 'Messgerät', type: 'text' }],
    });
    expect(result.errors).toEqual([]);
    expect(result.schema).toEqual([
      dosis,
      { key: 'messgeraet', label: 'Messgerät', unit: '', type: 'text' },
    ]);
    expect(result.changes).toEqual(['Feld Dosisleistung (µSv/h) angelegt', 'Feld Messgerät angelegt']);
  });

  it('macht einen doppelten Schlüssel eindeutig', async () => {
    const result = await editLayerSchema([dosis], {
      fields: [{ field: 'neu', label: 'Dosis-Leistung' }],
    });
    // „field" nennt ein vorhandenes Feld — „neu" gibt es nicht.
    expect(result.errors[0]).toMatch(/Feld "neu" gibt es in dieser Ebene nicht/);
    const neu = await editLayerSchema([dosis], { fields: [{ label: 'Dosis Leistung' }] });
    expect(neu.schema[1].key).toBe('dosis_leistung');
    const gleich = await editLayerSchema(
      [{ ...dosis, label: 'Alt' }],
      { fields: [{ label: 'Dosisleistung' }] },
    );
    expect(gleich.schema[1].key).toBe('dosisleistung_2');
  });

  it('nimmt eine Formel als berechnetes Feld und prüft ihre Felder', async () => {
    const ok = await editLayerSchema([dosis], {
      fields: [{ label: 'Dosis 8 h', unit: 'µSv', formula: 'dosisleistung * 8' }],
    });
    expect(ok.errors).toEqual([]);
    expect(ok.schema[1]).toEqual({
      key: 'dosis_8_h',
      label: 'Dosis 8 h',
      unit: 'µSv',
      type: 'computed',
      formula: 'dosisleistung * 8',
    });

    const falsch = await editLayerSchema([dosis], {
      fields: [{ label: 'Dosis', formula: 'leistung * sqrt(8)' }],
    });
    expect(falsch.errors[0]).toMatch(/Formel "leistung \* sqrt\(8\)".*leistung.*Felder: dosisleistung/);
  });

  it('verlangt bei einem berechneten Feld eine Formel', async () => {
    const result = await editLayerSchema([], { fields: [{ label: 'Summe', type: 'computed' }] });
    expect(result.errors[0]).toMatch(/braucht eine Formel/);
  });

  it('liest den Vorgabewert nach dem Typ', async () => {
    const result = await editLayerSchema([], {
      fields: [
        { label: 'Grenzwert', defaultValue: '2,5' },
        { label: 'Kontaminiert', type: 'boolean', defaultValue: 'nein' },
      ],
    });
    expect(result.schema.map((f) => f.defaultValue)).toEqual([2.5, false]);
  });

  it('lehnt einen unbekannten Typ ab', async () => {
    const result = await editLayerSchema([], { fields: [{ label: 'X', type: 'datum' }] });
    expect(result.errors[0]).toMatch(/Typ "datum".*number, text, boolean, computed/);
  });
});

describe('editLayerSchema — Felder ändern und entfernen', () => {
  const punkte = [
    { id: 'p', type: 'marker', name: 'Messung', fieldData: { dosisleistung: 5 } },
  ] as FirecallItem[];

  it('ändert Bezeichnung und Einheit, der Schlüssel bleibt', async () => {
    const result = await editLayerSchema([dosis], {
      fields: [{ field: 'Dosisleistung', label: 'Ortsdosisleistung', unit: 'mSv/h' }],
    });
    expect(result.errors).toEqual([]);
    expect(result.schema).toEqual([
      { key: 'dosisleistung', label: 'Ortsdosisleistung', unit: 'mSv/h', type: 'number' },
    ]);
    expect(result.changes).toEqual([
      'Feld Dosisleistung: Bezeichnung Ortsdosisleistung, Einheit mSv/h',
    ]);
  });

  it('ordnet eine gleichnamige Angabe ohne field dem vorhandenen Feld zu', async () => {
    const result = await editLayerSchema([dosis], { fields: [{ label: 'dosisleistung', unit: 'nSv/h' }] });
    expect(result.schema).toHaveLength(1);
    expect(result.schema[0].unit).toBe('nSv/h');
  });

  it('ändert Einheit und Typ nicht, wenn es schon Werte gibt', async () => {
    const result = await editLayerSchema(
      [dosis],
      { fields: [{ field: 'dosisleistung', unit: 'mSv/h' }] },
      punkte,
    );
    expect(result.errors[0]).toMatch(/1 Element hat schon Werte in µSv\/h/);
  });

  it('entfernt Felder, aber keines, von dem eine Formel abhängt', async () => {
    const schema: DataSchemaField[] = [
      dosis,
      { key: 'notiz', label: 'Notiz', unit: '', type: 'text' },
      { key: 'd8', label: 'Dosis 8 h', unit: 'µSv', type: 'computed', formula: 'dosisleistung * 8' },
    ];
    const ok = await editLayerSchema(schema, { removeFields: ['Notiz'] });
    expect(ok.schema.map((f) => f.key)).toEqual(['dosisleistung', 'd8']);
    expect(ok.changes).toEqual(['Feld Notiz entfernt']);

    const abhaengig = await editLayerSchema(schema, { removeFields: ['dosisleistung'] });
    expect(abhaengig.errors[0]).toMatch(/Formel "dosisleistung \* 8" von "Dosis 8 h"/);

    const fehlt = await editLayerSchema(schema, { removeFields: ['Temperatur'] });
    expect(fehlt.errors[0]).toMatch(/Feld "Temperatur" gibt es in dieser Ebene nicht/);
  });
});
