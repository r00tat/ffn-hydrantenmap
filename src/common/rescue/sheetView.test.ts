import { describe, expect, it } from 'vitest';
import {
  formatRescueBuildYears,
  formatRescueSheetTitle,
  toRescueSheetView,
} from './sheetView';
import { RescueVariant } from './types';

const VARIANT: RescueVariant = {
  id: '35',
  makeName: 'Audi',
  modelName: 'A1',
  variantName: 'A1',
  bodyType: 'Hatchback',
  buildYearFrom: 2010,
  buildYearUntil: 2018,
  doors: '3',
  powertrain: 'Gasoline/Diesel',
  documents: [
    { url: 'https://example.test/a1_EN.pdf', language: 'EN', type: 'sheet' },
    { url: 'https://example.test/a1_DE.pdf', language: 'DE', type: 'sheet' },
    { url: 'https://example.test/audi_DE.pdf', language: 'DE', type: 'guide' },
    { url: 'https://example.test/audi_FR.pdf', language: 'FR', type: 'guide' },
  ],
};

describe('toRescueSheetView', () => {
  it('picks the documents in the users language', () => {
    const view = toRescueSheetView(VARIANT, 'de');
    expect(view.sheetUrl).toBe('https://example.test/a1_DE.pdf');
    expect(view.sheetLanguage).toBe('DE');
    expect(view.guideUrl).toBe('https://example.test/audi_DE.pdf');
  });

  it('follows the locale', () => {
    const view = toRescueSheetView(VARIANT, 'en');
    expect(view.sheetUrl).toBe('https://example.test/a1_EN.pdf');
    expect(view.sheetLanguage).toBe('EN');
  });

  it('falls back to the other language when the locale is missing', () => {
    const view = toRescueSheetView(
      {
        ...VARIANT,
        documents: [
          {
            url: 'https://example.test/a1_DE.pdf',
            language: 'DE',
            type: 'sheet',
          },
        ],
      },
      'en',
    );
    expect(view.sheetUrl).toBe('https://example.test/a1_DE.pdf');
    expect(view.sheetLanguage).toBe('DE');
  });

  it('falls back to any language as a last resort', () => {
    const view = toRescueSheetView(
      {
        ...VARIANT,
        documents: [
          {
            url: 'https://example.test/a1_IT.pdf',
            language: 'IT',
            type: 'sheet',
          },
        ],
      },
      'de',
    );
    expect(view.sheetUrl).toBe('https://example.test/a1_IT.pdf');
    expect(view.sheetLanguage).toBe('IT');
  });

  it('leaves the urls undefined when there is no document', () => {
    const view = toRescueSheetView({ ...VARIANT, documents: [] }, 'de');
    expect(view.sheetUrl).toBeUndefined();
    expect(view.guideUrl).toBeUndefined();
  });

  it('carries the descriptive fields over', () => {
    const view = toRescueSheetView(VARIANT, 'de');
    expect(view).toMatchObject({
      id: '35',
      makeName: 'Audi',
      modelName: 'A1',
      bodyType: 'Hatchback',
      buildYearFrom: 2010,
      buildYearUntil: 2018,
      doors: '3',
    });
  });
});

describe('formatRescueSheetTitle', () => {
  it('joins make and variant name', () => {
    expect(formatRescueSheetTitle(toRescueSheetView(VARIANT, 'de'))).toBe(
      'Audi A1',
    );
  });

  it('uses the fuller variant name', () => {
    expect(
      formatRescueSheetTitle(
        toRescueSheetView({ ...VARIANT, variantName: 'A1 Sportback' }, 'de'),
      ),
    ).toBe('Audi A1 Sportback');
  });
});

describe('formatRescueBuildYears', () => {
  it('renders a closed build period', () => {
    expect(formatRescueBuildYears(toRescueSheetView(VARIANT, 'de'))).toBe(
      '2010–2018',
    );
  });

  it('leaves an ongoing build period open', () => {
    expect(
      formatRescueBuildYears(
        toRescueSheetView({ ...VARIANT, buildYearUntil: undefined }, 'de'),
      ),
    ).toBe('2010–');
  });

  it('is empty without a build year', () => {
    expect(
      formatRescueBuildYears(
        toRescueSheetView(
          { ...VARIANT, buildYearFrom: undefined, buildYearUntil: undefined },
          'de',
        ),
      ),
    ).toBe('');
  });
});
