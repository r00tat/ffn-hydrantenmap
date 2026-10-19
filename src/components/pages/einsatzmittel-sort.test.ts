import { describe, expect, it } from 'vitest';
import type { FirecallItem } from '../firebase/firestore';
import { sortEinsatzmittel } from './einsatzmittel-sort';

function item(
  id: string,
  fields: Partial<FirecallItem> & {
    fw?: string;
    tacticalUnitId?: string;
  } = {},
): FirecallItem {
  return { id, name: id, type: 'vehicle', ...fields } as FirecallItem;
}

const names = (items: FirecallItem[]) => items.map((i) => i.name);

describe('sortEinsatzmittel', () => {
  it('sortiert nach Zeit wie bisher über das Datum', () => {
    const items = [
      item('B', { datum: '2026-10-19T10:05:00' }),
      item('A', { datum: '2026-10-19T10:00:00' }),
    ];
    expect(names(sortEinsatzmittel(items, 'time'))).toEqual(['A', 'B']);
  });

  it('sortiert nach Feuerwehr, innerhalb nach Name, ohne Feuerwehr zuletzt', () => {
    const items = [
      item('TLFA', { fw: 'Weiden' }),
      item('KDTF'),
      item('RLFA', { fw: 'Neusiedl am See' }),
      item('KLF', { fw: 'Neusiedl am See' }),
    ];
    expect(names(sortEinsatzmittel(items, 'fw'))).toEqual([
      'KLF',
      'RLFA',
      'TLFA',
      'KDTF',
    ]);
  });

  it('vergleicht Feuerwehren ohne Rücksicht auf Groß- und Kleinschreibung', () => {
    const items = [item('X', { fw: 'weiden' }), item('Y', { fw: 'Gols' })];
    expect(names(sortEinsatzmittel(items, 'fw'))).toEqual(['Y', 'X']);
  });

  it('sortiert nach Einheit: Einheit vor ihren Fahrzeugen, ohne Einheit zuletzt', () => {
    const items = [
      item('Solo'),
      item('TLF', { tacticalUnitId: 'z2' }),
      item('z2', { type: 'tacticalUnit', name: '2. Zug' }),
      item('KLF', { tacticalUnitId: 'z1' }),
      item('z1', { type: 'tacticalUnit', name: '1. Zug' }),
      item('HLF', { tacticalUnitId: 'z1' }),
    ];
    expect(names(sortEinsatzmittel(items, 'unit'))).toEqual([
      '1. Zug',
      'HLF',
      'KLF',
      '2. Zug',
      'TLF',
      'Solo',
    ]);
  });

  it('reiht Unter-Einheiten unter ihre Einheit, auch wenn diese auf einer anderen Ebene liegt', () => {
    const all = [
      item('b', { type: 'tacticalUnit', name: 'Bereitschaft' }),
      item('z', { type: 'tacticalUnit', name: 'Zug', tacticalUnitId: 'b' }),
      item('F1', { tacticalUnitId: 'z' }),
      item('F0', { tacticalUnitId: 'b' }),
      item('Andere', { type: 'tacticalUnit', name: 'Andere' }),
    ];
    // Auf der Ebene liegt nur ein Teil; die Bereitschaft selbst nicht.
    const layerItems = [all[2], all[1], all[3], all[4]];
    expect(names(sortEinsatzmittel(layerItems, 'unit', all))).toEqual([
      'Andere',
      'F0',
      'Zug',
      'F1',
    ]);
  });

  it('ändert die übergebene Liste nicht', () => {
    const items = [item('B'), item('A')];
    sortEinsatzmittel(items, 'fw');
    expect(names(items)).toEqual(['B', 'A']);
  });
});
