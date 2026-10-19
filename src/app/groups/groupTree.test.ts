import { describe, expect, it } from 'vitest';
import { orderGroupsAsTree } from '../../common/groupHierarchy';
import { visibleGroupTree } from './groupTree';

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
