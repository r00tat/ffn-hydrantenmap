import { describe, expect, it } from 'vitest';
import { searchRescueVariants } from './searchVariants';
import { RescueVariant } from './types';

const CATALOG: RescueVariant[] = [
  {
    id: '1',
    makeName: 'Audi',
    modelName: 'A3',
    variantName: 'A3 Sportback',
    bodyType: 'Hatchback',
    buildYearFrom: 2012,
    buildYearUntil: 2020,
    documents: [],
  },
  {
    id: '2',
    makeName: 'Audi',
    modelName: 'A4',
    variantName: 'A4 Avant',
    bodyType: 'Stationwagon',
    buildYearFrom: 2015,
    documents: [],
  },
  {
    id: '3',
    makeName: 'Škoda',
    modelName: 'Octavia',
    variantName: 'Octavia Combi',
    bodyType: 'Stationwagon',
    buildYearFrom: 2020,
    documents: [],
  },
];

describe('searchRescueVariants', () => {
  it('finds by make', () => {
    const found = searchRescueVariants('audi', CATALOG);
    expect(found.map((v) => v.id)).toEqual(['1', '2']);
  });

  it('finds by make and model together', () => {
    const found = searchRescueVariants('audi a4', CATALOG);
    expect(found.map((v) => v.id)).toEqual(['2']);
  });

  it('ignores diacritics and case', () => {
    expect(searchRescueVariants('skoda', CATALOG).map((v) => v.id)).toEqual([
      '3',
    ]);
    expect(searchRescueVariants('OCTAVIA', CATALOG).map((v) => v.id)).toEqual([
      '3',
    ]);
  });

  it('finds by build year', () => {
    expect(searchRescueVariants('octavia 2020', CATALOG).map((v) => v.id)).toEqual(
      ['3'],
    );
  });

  it('returns nothing for a blank term', () => {
    expect(searchRescueVariants('   ', CATALOG)).toEqual([]);
  });

  it('respects the limit', () => {
    expect(searchRescueVariants('a', CATALOG, 1).length).toBe(1);
  });
});
