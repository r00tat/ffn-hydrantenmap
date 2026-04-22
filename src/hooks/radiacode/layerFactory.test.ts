import { describe, it, expect } from 'vitest';
import { createRadiacodeLayer } from './layerFactory';

describe('createRadiacodeLayer', () => {
  it('creates layer with radiacode type and required fields', () => {
    const layer = createRadiacodeLayer('Messung Einsatz X');
    expect(layer.layerType).toBe('radiacode');
    expect(layer.name).toBe('Messung Einsatz X');
    expect(layer.defaultVisible).toBe('true');
    expect(layer.sampleRate).toBe('normal');
  });

  it('includes dosisleistung, cps, uncertainties, device in dataSchema', () => {
    const layer = createRadiacodeLayer('Test');
    const keys = layer.dataSchema?.map((f) => f.key);
    expect(keys).toEqual([
      'dosisleistung',
      'dosisleistungErrPct',
      'cps',
      'cpsErrPct',
      'device',
    ]);
    expect(layer.dataSchema?.[0]).toMatchObject({
      key: 'dosisleistung',
      unit: 'µSv/h',
      type: 'number',
    });
    expect(layer.dataSchema?.find((f) => f.key === 'dosisleistungErrPct')).toMatchObject({
      unit: '%',
      type: 'number',
    });
    expect(layer.dataSchema?.find((f) => f.key === 'cpsErrPct')).toMatchObject({
      unit: '%',
      type: 'number',
    });
  });

  it('configures heatmap for inverse-square interpolation on dosisleistung, log scale', () => {
    const hm = createRadiacodeLayer('X').heatmapConfig!;
    expect(hm.enabled).toBe(true);
    expect(hm.activeKey).toBe('dosisleistung');
    expect(hm.visualizationMode).toBe('interpolation');
    expect(hm.interpolationAlgorithm).toBe('inv-square');
    expect(hm.colorScale).toBe('log');
  });
});
