import { describe, expect, it } from 'vitest';
import { matchRescueVariants } from './matchVehicle';
import { RescueVariant } from './types';

function variant(v: Partial<RescueVariant> & { id: string }): RescueVariant {
  return {
    makeName: 'Tesla',
    modelName: 'Model 3',
    variantName: 'Model 3',
    documents: [],
    ...v,
  };
}

const TESLA_2019 = variant({
  id: '1',
  buildYearFrom: 2019,
  bodyType: 'Sedan',
  powertrain: 'Electric',
});
const TESLA_2024 = variant({
  id: '2',
  buildYearFrom: 2024,
  bodyType: 'Sedan',
  powertrain: 'Electric',
});
const MODEL_S = variant({
  id: '3',
  modelName: 'Model S',
  variantName: 'Model S',
  buildYearFrom: 2016,
  powertrain: 'Electric',
});
const GOLF = variant({
  id: '4',
  makeName: 'Volkswagen',
  modelName: 'Golf',
  variantName: 'Golf',
  buildYearFrom: 2020,
  powertrain: 'Gasoline/Diesel',
});

const CATALOG = [TESLA_2019, TESLA_2024, MODEL_S, GOLF];

describe('matchRescueVariants', () => {
  it('picks the variant whose build years cover the registration', () => {
    const matches = matchRescueVariants(
      {
        marke: 'TESLA',
        name: 'Model 3',
        antrieb: 'Elektro',
        erstzulassung: '2019-06-27',
      },
      CATALOG,
    );
    expect(matches[0]?.variant.id).toBe('1');
  });

  it('picks the newer variant for a newer registration', () => {
    const matches = matchRescueVariants(
      { marke: 'TESLA', name: 'Model 3', erstzulassung: '2025-02-01' },
      CATALOG,
    );
    expect(matches[0]?.variant.id).toBe('2');
  });

  it('excludes variants built long after the registration', () => {
    const matches = matchRescueVariants(
      { marke: 'TESLA', name: 'Model 3', erstzulassung: '2019-06-27' },
      CATALOG,
    );
    expect(matches.map((m) => m.variant.id)).not.toContain('2');
  });

  it('never returns another make', () => {
    const matches = matchRescueVariants(
      { marke: 'TESLA', name: 'Model 3' },
      CATALOG,
    );
    expect(matches.every((m) => m.variant.makeName === 'Tesla')).toBe(true);
  });

  it('resolves the make alias from the registration data', () => {
    const matches = matchRescueVariants(
      { marke: 'VW', name: 'Golf', erstzulassung: '2021-03-04' },
      CATALOG,
    );
    expect(matches[0]?.variant.id).toBe('4');
  });

  it('matches a fuller registration name against the base model', () => {
    const sportback = variant({
      id: '5',
      makeName: 'Audi',
      modelName: 'A3',
      variantName: 'A3 Sportback',
      buildYearFrom: 2012,
      buildYearUntil: 2020,
    });
    const matches = matchRescueVariants(
      { marke: 'AUDI', name: 'A3 SPORTBACK', erstzulassung: '2015-01-01' },
      [...CATALOG, sportback],
    );
    expect(matches[0]?.variant.id).toBe('5');
  });

  it('returns an empty list when nothing fits', () => {
    expect(
      matchRescueVariants({ marke: 'Steyr', name: '680' }, CATALOG),
    ).toEqual([]);
    expect(matchRescueVariants({ marke: '', name: '' }, CATALOG)).toEqual([]);
  });

  it('prefers the matching powertrain among equally named variants', () => {
    const diesel = variant({
      id: '6',
      makeName: 'BMW',
      modelName: '320',
      variantName: '320d',
      buildYearFrom: 2019,
      powertrain: 'Gasoline/Diesel',
    });
    const electric = variant({
      id: '7',
      makeName: 'BMW',
      modelName: '320',
      variantName: '320e',
      buildYearFrom: 2019,
      powertrain: 'Electric',
    });
    const matches = matchRescueVariants(
      {
        marke: 'BMW',
        name: '320',
        antrieb: 'Diesel',
        erstzulassung: '2020-01-01',
      },
      [diesel, electric],
    );
    expect(matches[0]?.variant.id).toBe('6');
  });

  it('caps the number of results', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      variant({ id: `x${i}`, buildYearFrom: 2019 }),
    );
    expect(
      matchRescueVariants({ marke: 'Tesla', name: 'Model 3' }, many).length,
    ).toBeLessThanOrEqual(10);
  });
});

describe('matchRescueVariants with catalog-specific naming', () => {
  const golfBase = {
    makeName: 'Volkswagen',
    modelName: 'Golf',
    documents: [],
  };
  const GOLF_VII = {
    ...golfBase,
    id: 'g1',
    variantName: 'Golf',
    buildYearFrom: 2012,
    buildYearUntil: 2018,
  };
  const GOLF_SPORTSVAN = {
    ...golfBase,
    id: 'g2',
    variantName: 'Golf Sportsvan',
    buildYearFrom: 2014,
    buildYearUntil: 2018,
  };

  it('prefers the plain model over a longer variant of the same model', () => {
    const matches = matchRescueVariants(
      { marke: 'VOLKSWAGEN', name: 'Golf', erstzulassung: '2016-04-01' },
      [GOLF_SPORTSVAN, GOLF_VII],
    );
    expect(matches[0]?.variant.id).toBe('g1');
  });

  it('finds the BMW series behind a type number', () => {
    const series3 = variant({
      id: 'b1',
      makeName: 'BMW',
      modelName: '3 Series',
      variantName: '3 Series',
      buildYearFrom: 2018,
      powertrain: 'Gasoline/Diesel',
    });
    const matches = matchRescueVariants(
      {
        marke: 'BMW',
        name: '320d',
        antrieb: 'Diesel',
        erstzulassung: '2020-01-01',
      },
      [series3],
    );
    expect(matches[0]?.variant.id).toBe('b1');
  });

  it('finds the Mercedes class behind a type number', () => {
    const cClass = variant({
      id: 'm1',
      makeName: 'Mercedes-Benz',
      modelName: 'C-Class',
      variantName: 'C-Class',
      buildYearFrom: 2014,
    });
    const matches = matchRescueVariants(
      { marke: 'MERCEDES', name: 'C 220 d', erstzulassung: '2018-06-01' },
      [cClass],
    );
    expect(matches[0]?.variant.id).toBe('m1');
  });
});
