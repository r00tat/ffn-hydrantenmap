import { beforeEach, describe, expect, it, vi } from 'vitest';

const sample = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('../../../common/terrain/terrainClient', () => ({
  terrainClient: () => ({ sample: sample.fn }),
}));

import {
  istFrischAngelegt,
  merkeFrischAngelegt,
  vergissFrischAngelegt,
  wasserstandBasis,
} from './wasserstandAnlegen';

describe('wasserstandBasis', () => {
  beforeEach(() => {
    sample.fn.mockReset();
  });

  it('liefert Höhe und Stufe als Feldsatz', async () => {
    sample.fn.mockResolvedValue([{ heightM: 115.83, level: 'detail' }]);
    await expect(wasserstandBasis([47.9483, 16.8482])).resolves.toEqual({
      wasserBasisHoehe: 115.83,
      wasserBasisStufe: 'detail',
    });
  });

  it('gibt ohne Höhe nichts zurück, statt zu werfen', async () => {
    sample.fn.mockResolvedValue([null]);
    await expect(wasserstandBasis([47.9483, 16.8482])).resolves.toBeUndefined();
  });

  it('schluckt einen Fehler des Höhenmodells', async () => {
    sample.fn.mockRejectedValue(new Error('offline'));
    await expect(wasserstandBasis([47.9483, 16.8482])).resolves.toBeUndefined();
  });
});

describe('frisch angelegte Elemente', () => {
  it('antwortet auf dieselbe Frage gleich, solange nichts abgeräumt ist', () => {
    merkeFrischAngelegt('w1');
    expect(istFrischAngelegt('w1')).toBe(true);
    // Zweimal dieselbe Antwort: beim Rendern darf die Frage nichts verbrauchen.
    expect(istFrischAngelegt('w1')).toBe(true);
    vergissFrischAngelegt('w1');
    expect(istFrischAngelegt('w1')).toBe(false);
  });

  it('kennt fremde Elemente nicht', () => {
    expect(istFrischAngelegt('unbekannt')).toBe(false);
    expect(istFrischAngelegt(undefined)).toBe(false);
  });
});
