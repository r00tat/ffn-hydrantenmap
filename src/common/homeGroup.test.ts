import { describe, expect, it } from 'vitest';
import {
  homeGroupFirst,
  normalizeHomeGroup,
  resolveHomeGroupWrite,
  selectDefaultGroupId,
} from './homeGroup';

describe('selectDefaultGroupId', () => {
  const groupIds = ['a', 'b', 'c'];

  it('nimmt die manuelle Wahl auf der Seite vor allem anderen', () => {
    expect(
      selectDefaultGroupId({ groupIds, manualGroupId: 'c', homeGroup: 'b', storedGroupId: 'a' }),
    ).toBe('c');
  });

  it('nimmt die Heimatgruppe vor der zuletzt genutzten Gruppe', () => {
    expect(selectDefaultGroupId({ groupIds, homeGroup: 'b', storedGroupId: 'c' })).toBe('b');
  });

  it('übergeht eine Heimatgruppe, die auf dieser Seite nicht zur Auswahl steht', () => {
    expect(selectDefaultGroupId({ groupIds, homeGroup: 'x', storedGroupId: 'c' })).toBe('c');
  });

  it('fällt ohne Heimatgruppe auf die zuletzt genutzte und dann die erste Gruppe zurück', () => {
    expect(selectDefaultGroupId({ groupIds, storedGroupId: 'c' })).toBe('c');
    expect(selectDefaultGroupId({ groupIds, storedGroupId: 'x' })).toBe('a');
    expect(selectDefaultGroupId({ groupIds })).toBe('a');
  });

  it('übergeht eine manuelle Wahl, die nicht mehr zur Auswahl steht', () => {
    expect(selectDefaultGroupId({ groupIds, manualGroupId: 'x', homeGroup: 'b' })).toBe('b');
  });

  it('liefert ohne Gruppen nichts', () => {
    expect(selectDefaultGroupId({ groupIds: [], homeGroup: 'a' })).toBeUndefined();
  });
});

describe('normalizeHomeGroup', () => {
  it('lässt nur nicht leere Texte durch', () => {
    expect(normalizeHomeGroup('ffnd')).toBe('ffnd');
    expect(normalizeHomeGroup('  ')).toBeUndefined();
    expect(normalizeHomeGroup(null)).toBeUndefined();
    expect(normalizeHomeGroup(42)).toBeUndefined();
  });

  it('nimmt keine Pseudo-Gruppen an', () => {
    expect(normalizeHomeGroup('allUsers')).toBeUndefined();
  });
});

describe('resolveHomeGroupWrite', () => {
  const members = ['ffnd', 'abc'];

  it('lässt das Feld ohne Angabe unverändert', () => {
    expect(resolveHomeGroupWrite(undefined, members)).toEqual({ action: 'keep' });
  });

  it('löscht das Feld bei leerer Angabe', () => {
    expect(resolveHomeGroupWrite('', members)).toEqual({ action: 'delete' });
    expect(resolveHomeGroupWrite(null, members)).toEqual({ action: 'delete' });
  });

  it('setzt eine Gruppe, in der der Benutzer Mitglied ist', () => {
    expect(resolveHomeGroupWrite('abc', members)).toEqual({ action: 'set', groupId: 'abc' });
  });

  it('weist eine Gruppe ohne Mitgliedschaft und Pseudo-Gruppen ab', () => {
    expect(resolveHomeGroupWrite('fremd', members)).toEqual({ action: 'invalid' });
    expect(resolveHomeGroupWrite('allUsers', [...members, 'allUsers'])).toEqual({
      action: 'invalid',
    });
  });
});

describe('homeGroupFirst', () => {
  it('stellt die Heimatgruppe an den Anfang und lässt den Rest in Reihenfolge', () => {
    const groups = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(homeGroupFirst(groups, 'c').map((g) => g.id)).toEqual(['c', 'a', 'b']);
  });

  it('lässt die Liste ohne passende Heimatgruppe unverändert', () => {
    const groups = [{ id: 'a' }, { id: 'b' }];
    expect(homeGroupFirst(groups, undefined)).toBe(groups);
    expect(homeGroupFirst(groups, 'x')).toBe(groups);
  });
});
