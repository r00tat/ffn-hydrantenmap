import { describe, expect, it } from 'vitest';
import { FirecallItem } from '../../components/firebase/firestore';
import { findFirecallItemByName } from './itemLookup';

const items = [
  { id: '1', type: 'vehicle', name: 'TLFA 4000', fw: 'Neusiedl am See' },
  { id: '2', type: 'vehicle', name: 'KLF', fw: 'Weiden' },
  { id: '3', type: 'el', name: 'Einsatzleitung Nord' },
  { id: '4', type: 'marker', name: 'Sammelplatz', deleted: true },
] as FirecallItem[];

describe('findFirecallItemByName', () => {
  it('finds by exact name', () => {
    expect(findFirecallItemByName(items, 'TLFA 4000')?.id).toBe('1');
  });

  it('finds by partial name, case insensitive', () => {
    expect(findFirecallItemByName(items, 'einsatzleitung')?.id).toBe('3');
  });

  it('finds a vehicle named by type and fire brigade', () => {
    // „TLFA Neusiedl" steht so an keinem Element: Der Typ steht im Namen,
    // die Wehr im Feld fw.
    expect(findFirecallItemByName(items, 'TLFA Neusiedl')?.id).toBe('1');
  });

  it('does not match when only some words fit', () => {
    expect(findFirecallItemByName(items, 'TLFA Weiden')).toBeUndefined();
  });

  it('ignores deleted items', () => {
    expect(findFirecallItemByName(items, 'Sammelplatz')).toBeUndefined();
  });

  it('returns undefined for an empty or unknown query', () => {
    expect(findFirecallItemByName(items, '')).toBeUndefined();
    expect(findFirecallItemByName(items, '   ')).toBeUndefined();
    expect(findFirecallItemByName(items, 'Drehleiter')).toBeUndefined();
  });

  it('prefers the exact name over a token match', () => {
    const withBoth = [
      { id: 'a', type: 'vehicle', name: 'TLFA', fw: 'Neusiedl' },
      { id: 'b', type: 'vehicle', name: 'TLFA Neusiedl', fw: 'Podersdorf' },
    ] as unknown as FirecallItem[];
    expect(findFirecallItemByName(withBoth, 'TLFA Neusiedl')?.id).toBe('b');
  });
});
