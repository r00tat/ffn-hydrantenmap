import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { loadRescueCatalog } = vi.hoisted(() => ({
  loadRescueCatalog: vi.fn(),
}));
vi.mock('./euroRescueCatalog', () => ({ loadRescueCatalog }));

import {
  listRescueMakes,
  lookupRescueSheets,
  searchRescueSheets,
} from './rescueSheetLookup';
import { RescueVariant } from '../../common/rescue/types';

const TESLA: RescueVariant = {
  id: '1',
  makeName: 'Tesla',
  modelName: 'Model 3',
  variantName: 'Model 3',
  bodyType: 'Sedan',
  buildYearFrom: 2019,
  powertrain: 'Electric',
  documents: [
    { url: 'https://example.test/m3_DE.pdf', language: 'DE', type: 'sheet' },
    { url: 'https://example.test/m3_EN.pdf', language: 'EN', type: 'sheet' },
  ],
};

const AUDI: RescueVariant = {
  id: '2',
  makeName: 'Audi',
  modelName: 'A3',
  variantName: 'A3 Sportback',
  bodyType: 'Hatchback',
  buildYearFrom: 2012,
  buildYearUntil: 2020,
  documents: [],
};

describe('lookupRescueSheets', () => {
  beforeEach(() => {
    loadRescueCatalog.mockReset();
    loadRescueCatalog.mockResolvedValue([TESLA, AUDI]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns one ranked list per vehicle, in the users language', async () => {
    const result = await lookupRescueSheets(
      [
        {
          marke: 'TESLA',
          name: 'Model 3',
          antrieb: 'Elektro',
          erstzulassung: '2019-06-27',
        },
      ],
      'de',
    );

    expect(result).toHaveLength(1);
    expect(result[0][0]).toMatchObject({
      makeName: 'Tesla',
      sheetUrl: 'https://example.test/m3_DE.pdf',
      sheetLanguage: 'DE',
    });
  });

  it('keeps the result positions aligned with the vehicles', async () => {
    const result = await lookupRescueSheets(
      [
        { marke: 'Steyr', name: '680' },
        { marke: 'TESLA', name: 'Model 3', erstzulassung: '2020-01-01' },
      ],
      'de',
    );

    expect(result[0]).toEqual([]);
    expect(result[1][0]?.makeName).toBe('Tesla');
  });

  it('never fails the caller when the catalog is unavailable', async () => {
    loadRescueCatalog.mockRejectedValue(new Error('network down'));

    const result = await lookupRescueSheets(
      [{ marke: 'TESLA', name: 'Model 3' }],
      'de',
    );

    expect(result).toEqual([[]]);
  });
});

describe('searchRescueSheets', () => {
  beforeEach(() => {
    loadRescueCatalog.mockReset();
    loadRescueCatalog.mockResolvedValue([TESLA, AUDI]);
  });

  it('searches the catalog and resolves the documents', async () => {
    const found = await searchRescueSheets('tesla', 'en');
    expect(found).toHaveLength(1);
    expect(found[0].sheetUrl).toBe('https://example.test/m3_EN.pdf');
  });

  it('returns nothing for a blank term', async () => {
    expect(await searchRescueSheets('  ', 'de')).toEqual([]);
    expect(loadRescueCatalog).not.toHaveBeenCalled();
  });
});

describe('listRescueMakes', () => {
  beforeEach(() => {
    loadRescueCatalog.mockReset();
    loadRescueCatalog.mockResolvedValue([TESLA, AUDI, { ...TESLA, id: '3' }]);
  });

  it('lists every make once, sorted', async () => {
    expect(await listRescueMakes()).toEqual(['Audi', 'Tesla']);
  });
});
