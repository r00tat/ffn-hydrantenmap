import { describe, expect, it } from 'vitest';
import {
  documentSearchEntries,
  firstLine,
  itemSearchEntries,
  locationSearchEntries,
  normalizeSearchText,
  rankSearchEntries,
  scoreSearchEntry,
  type SearchEntry,
} from './hotkeySearch';

const page = (title: string): SearchEntry => ({
  key: `page:${title}`,
  kind: 'page',
  title,
});

describe('normalizeSearchText', () => {
  it('lowercases and strips accents and ß', () => {
    expect(normalizeSearchText('Hauptstraße Ä')).toBe('hauptstrasse a');
    expect(normalizeSearchText(undefined)).toBe('');
  });
});

describe('scoreSearchEntry', () => {
  const entry: SearchEntry = {
    key: 'item:1',
    kind: 'item',
    title: 'TLF Neusiedl',
    subtitle: 'Fahrzeug · am Hydrant',
  };

  it('requires every token to match somewhere', () => {
    expect(scoreSearchEntry(entry, 'tlf hydrant')).not.toBeNull();
    expect(scoreSearchEntry(entry, 'tlf pumpe')).toBeNull();
  });

  it('ranks word starts in the title above other matches', () => {
    const wordStart = scoreSearchEntry(entry, 'neu') ?? 0;
    const inside = scoreSearchEntry(entry, 'siedl') ?? 0;
    const inSubtitle = scoreSearchEntry(entry, 'hydrant') ?? 0;
    expect(wordStart).toBeGreaterThan(inside);
    expect(inside).toBeGreaterThan(inSubtitle);
  });
});

describe('rankSearchEntries', () => {
  const entries: SearchEntry[] = [
    page('Karte'),
    { key: 'item:a', kind: 'item', title: 'Wasserentnahme Karl', subtitle: 'Marker' },
    { key: 'item:b', kind: 'item', title: 'Karl', subtitle: 'Marker' },
    { key: 'diary:c', kind: 'diary', title: '3 Lagemeldung', subtitle: 'Karl informiert' },
    page('Einsatztagebuch'),
  ];

  it('returns only pages for an empty query', () => {
    expect(rankSearchEntries(entries, '  ').map((e) => e.key)).toEqual([
      'page:Karte',
      'page:Einsatztagebuch',
    ]);
  });

  it('puts the exact title first and title matches before text matches', () => {
    expect(rankSearchEntries(entries, 'karl').map((e) => e.key)).toEqual([
      'item:b',
      'item:a',
      'diary:c',
    ]);
  });

  it('keeps the input order on equal score and respects the limit', () => {
    const many = [page('Ebenen A'), page('Ebenen B'), page('Ebenen C')];
    expect(rankSearchEntries(many, 'ebenen', 2).map((e) => e.title)).toEqual([
      'Ebenen A',
      'Ebenen B',
    ]);
  });
});

describe('firstLine', () => {
  it('takes the first non-empty line and shortens it', () => {
    expect(firstLine('\n  zweite\ndritte')).toBe('zweite');
    expect(firstLine('abcdef', 4)).toBe('abc…');
    expect(firstLine(undefined)).toBe('');
  });
});

describe('itemSearchEntries', () => {
  it('skips documents, layers and deleted items and labels the type', () => {
    const entries = itemSearchEntries(
      [
        { id: '1', type: 'vehicle', name: 'KDTF', beschreibung: 'vor Ort\nmehr' },
        { id: '2', type: 'diary', name: 'Eintrag' },
        { id: '3', type: 'layer', name: 'Ebene' },
        { id: '4', type: 'marker', name: '', deleted: true },
        { id: '5', type: 'marker', name: '' },
      ],
      (type) => (type === 'vehicle' ? 'Fahrzeug' : 'Marker'),
    );
    expect(entries.map((e) => [e.key, e.title, e.subtitle])).toEqual([
      ['item:1', 'KDTF', 'Fahrzeug · vor Ort'],
      ['item:5', 'Marker', 'Marker'],
    ]);
  });
});

describe('documentSearchEntries', () => {
  it('builds numbered entries of one kind', () => {
    const entries = documentSearchEntries(
      [
        { id: 'd1', type: 'diary', nummer: 4, name: 'Lage', von: 'EL', an: 'ATS', beschreibung: 'ruhig' },
        { id: 'g1', type: 'gb', nummer: 1, name: 'Fax' },
      ],
      'diary',
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      key: 'diary:d1',
      kind: 'diary',
      title: '4 Lage',
      subtitle: 'EL → ATS · ruhig',
    });
  });
});

describe('locationSearchEntries', () => {
  it('uses the name or the address as title', () => {
    const entries = locationSearchEntries(
      [
        { id: 'l1', name: 'Keller', street: 'Hauptplatz', number: '1', city: 'Neusiedl am See' },
        { id: 'l2', name: '', street: 'Seestraße', number: '', city: '' },
        { id: 'l3', name: 'weg', deleted: true },
      ],
      'Einsatzort',
    );
    expect(entries.map((e) => [e.key, e.title, e.subtitle])).toEqual([
      ['location:l1', 'Keller', 'Einsatzort · Hauptplatz 1, Neusiedl am See'],
      ['location:l2', 'Seestraße', 'Einsatzort · Seestraße'],
    ]);
  });
});
