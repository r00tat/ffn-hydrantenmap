import { describe, expect, it } from 'vitest';
import { orderGroupsAsTree } from '../../common/groupHierarchy';
import {
  dropTargetParent,
  groupDropId,
  ROOT_DROP_ID,
  visibleGroupTree,
} from './groupTree';

const tree = orderGroupsAsTree([
  { id: 'bezirk', name: 'Bezirk' },
  { id: 'abschnitt', name: 'Abschnitt 1', parentId: 'bezirk' },
  { id: 'ffa', name: 'FF Alpha', parentId: 'abschnitt' },
  { id: 'ffb', name: 'FF Bravo', parentId: 'abschnitt' },
  { id: 'solo', name: 'Solo' },
]);

const ids = (rows: ReturnType<typeof visibleGroupTree>) =>
  rows.map((r) => r.group.id);

describe('visibleGroupTree', () => {
  it('zeigt ohne Suche alles aufgeklappt und kennzeichnet Gruppen mit Untergruppen', () => {
    const rows = visibleGroupTree(tree, '', new Set());
    expect(ids(rows)).toEqual(['bezirk', 'abschnitt', 'ffa', 'ffb', 'solo']);
    expect(rows.map((r) => r.hasChildren)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
    expect(rows.every((r) => r.expanded)).toBe(true);
  });

  it('blendet die Untergruppen einer zugeklappten Gruppe aus', () => {
    const rows = visibleGroupTree(tree, '', new Set(['abschnitt']));
    expect(ids(rows)).toEqual(['bezirk', 'abschnitt', 'solo']);
    expect(rows[1].expanded).toBe(false);
  });

  it('zeigt bei der Suche die Treffer samt ihrer Elterngruppen, auch zugeklappt', () => {
    expect(ids(visibleGroupTree(tree, 'bravo', new Set(['bezirk'])))).toEqual([
      'bezirk',
      'abschnitt',
      'ffb',
    ]);
  });

  it('sucht auch in der Beschreibung', () => {
    const withDescription = orderGroupsAsTree([
      { id: 'x', name: 'X', description: 'Feuerwehrhaus Nord' },
      { id: 'y', name: 'Y' },
    ]);
    expect(ids(visibleGroupTree(withDescription, 'nord', new Set()))).toEqual([
      'x',
    ]);
  });
});

describe('dropTargetParent', () => {
  const groups = [
    { id: 'bezirk', name: 'Bezirk' },
    { id: 'abschnitt', name: 'Abschnitt 1', parentId: 'bezirk' },
    { id: 'ffa', name: 'FF Alpha', parentId: 'abschnitt' },
    { id: 'solo', name: 'Solo' },
    { id: 'allUsers', name: 'Alle Benutzer' },
  ];

  it('macht die Gruppe zur Untergruppe der Zielgruppe', () => {
    expect(dropTargetParent('solo', groupDropId('abschnitt'), groups)).toBe(
      'abschnitt'
    );
    expect(dropTargetParent('ffa', groupDropId('solo'), groups)).toBe('solo');
  });

  it('setzt die Gruppe auf der Ablagefläche oben auf die oberste Ebene', () => {
    expect(dropTargetParent('ffa', ROOT_DROP_ID, groups)).toBeNull();
  });

  it('ignoriert Ablegen ohne Änderung', () => {
    expect(dropTargetParent('ffa', groupDropId('abschnitt'), groups)).toBeUndefined();
    expect(dropTargetParent('solo', ROOT_DROP_ID, groups)).toBeUndefined();
    expect(dropTargetParent('solo', undefined, groups)).toBeUndefined();
  });

  it('verbietet die Gruppe selbst, eigene Untergruppen und Pseudo-Gruppen', () => {
    expect(dropTargetParent('bezirk', groupDropId('bezirk'), groups)).toBeUndefined();
    expect(dropTargetParent('bezirk', groupDropId('ffa'), groups)).toBeUndefined();
    expect(dropTargetParent('solo', groupDropId('allUsers'), groups)).toBeUndefined();
    expect(dropTargetParent('allUsers', groupDropId('solo'), groups)).toBeUndefined();
  });
});
