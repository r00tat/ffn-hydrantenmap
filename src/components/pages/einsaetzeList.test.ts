import { describe, expect, it } from 'vitest';
import type { Firecall } from '../firebase/firestore';
import {
  filterFirecalls,
  groupFirecallsByYear,
  matchesFirecallSearch,
} from './einsaetzeList';

const fc = (overrides: Partial<Firecall>): Firecall => ({
  name: 'Einsatz',
  deleted: false,
  ...overrides,
});

describe('groupFirecallsByYear', () => {
  it('gruppiert nach Jahr, neuestes Jahr zuerst, Reihenfolge innerhalb bleibt', () => {
    const list = [
      fc({ id: 'a', date: '2026-05-01T10:00:00' }),
      fc({ id: 'b', date: '2026-01-03T10:00:00' }),
      fc({ id: 'c', date: '2025-12-31T23:00:00' }),
      fc({ id: 'd', date: '2024-07-01T08:00:00' }),
    ];
    const groups = groupFirecallsByYear(list);
    expect(groups.map((g) => g.year)).toEqual([2026, 2025, 2024]);
    expect(groups[0].firecalls.map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('sortiert Jahre absteigend, auch wenn die Eingabe unsortiert ist', () => {
    const groups = groupFirecallsByYear([
      fc({ id: 'a', date: '2023-05-01T10:00:00' }),
      fc({ id: 'b', date: '2025-01-03T10:00:00' }),
    ]);
    expect(groups.map((g) => g.year)).toEqual([2025, 2023]);
  });

  it('legt Einsätze ohne gültiges Datum in eine eigene Gruppe am Ende', () => {
    const groups = groupFirecallsByYear([
      fc({ id: 'a' }),
      fc({ id: 'b', date: 'kein Datum' }),
      fc({ id: 'c', date: '2025-01-03T10:00:00' }),
    ]);
    expect(groups.map((g) => g.year)).toEqual([2025, undefined]);
    expect(groups[1].firecalls.map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('liefert für eine leere Liste keine Gruppen', () => {
    expect(groupFirecallsByYear([])).toEqual([]);
  });
});

describe('matchesFirecallSearch', () => {
  const einsatz = fc({
    name: 'Brand Wohnhaus',
    fw: 'Neusiedl am See',
    description: 'Küchenbrand im ersten Stock',
    date: '2025-03-07T14:30:00',
  });

  it('passt bei leerer Suche immer', () => {
    expect(matchesFirecallSearch(einsatz, '')).toBe(true);
    expect(matchesFirecallSearch(einsatz, '   ')).toBe(true);
  });

  it('sucht im Titel ohne Rücksicht auf Groß-/Kleinschreibung', () => {
    expect(matchesFirecallSearch(einsatz, 'wohnhaus')).toBe(true);
    expect(matchesFirecallSearch(einsatz, 'Verkehrsunfall')).toBe(false);
  });

  it('sucht in Feuerwehr und Beschreibung', () => {
    expect(matchesFirecallSearch(einsatz, 'neusiedl')).toBe(true);
    expect(matchesFirecallSearch(einsatz, 'küchenbrand')).toBe(true);
  });

  it('findet das Datum in der angezeigten Schreibweise', () => {
    expect(matchesFirecallSearch(einsatz, '07.03.2025')).toBe(true);
    expect(matchesFirecallSearch(einsatz, '03.2025')).toBe(true);
    expect(matchesFirecallSearch(einsatz, '7.3.2025')).toBe(true);
    expect(matchesFirecallSearch(einsatz, '08.03.2025')).toBe(false);
  });

  it('verlangt, dass jedes Suchwort irgendwo vorkommt', () => {
    expect(matchesFirecallSearch(einsatz, 'brand 2025')).toBe(true);
    expect(matchesFirecallSearch(einsatz, 'brand 2024')).toBe(false);
  });

  it('kommt mit fehlenden Feldern zurecht', () => {
    expect(matchesFirecallSearch(fc({ name: 'Ölspur' }), 'öl')).toBe(true);
  });
});

describe('filterFirecalls', () => {
  it('lässt nur passende Einsätze übrig', () => {
    const list = [
      fc({ id: 'a', name: 'Brand' }),
      fc({ id: 'b', name: 'Ölspur' }),
    ];
    expect(filterFirecalls(list, 'öl').map((f) => f.id)).toEqual(['b']);
    expect(filterFirecalls(list, '')).toBe(list);
  });
});
