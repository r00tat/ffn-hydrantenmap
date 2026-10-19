import { describe, expect, it } from 'vitest';
import {
  ancestorGroupIds,
  descendantGroupIds,
  impliedGroupIds,
  isValidParent,
  orderGroupsAsTree,
  planAncestorMemberships,
  withAncestorGroups,
} from './groupHierarchy';

const g = (id: string, name: string, parentId?: string | null) => ({
  id,
  name,
  parentId,
});

// Bezirk → Abschnitt → Feuerwehr, daneben eine zweite Feuerwehr im Abschnitt
// und eine Gruppe ohne Eltern.
const groups = [
  g('bezirk', 'Bezirk'),
  g('abschnitt', 'Abschnitt 1', 'bezirk'),
  g('ffa', 'FF Alpha', 'abschnitt'),
  g('ffb', 'FF Bravo', 'abschnitt'),
  g('solo', 'Solo'),
];

describe('ancestorGroupIds', () => {
  it('lists the parents, nearest first', () => {
    expect(ancestorGroupIds('ffa', groups)).toEqual(['abschnitt', 'bezirk']);
  });

  it('is empty for a root group and for an unknown group', () => {
    expect(ancestorGroupIds('bezirk', groups)).toEqual([]);
    expect(ancestorGroupIds('unknown', groups)).toEqual([]);
  });

  it('stops at a parent that does not exist', () => {
    expect(ancestorGroupIds('x', [g('x', 'X', 'gone')])).toEqual([]);
  });

  it('terminates on a cycle', () => {
    const cyclic = [g('a', 'A', 'b'), g('b', 'B', 'a')];
    expect(ancestorGroupIds('a', cyclic)).toEqual(['b']);
  });
});

describe('descendantGroupIds', () => {
  it('lists all groups below', () => {
    expect(descendantGroupIds('bezirk', groups).sort()).toEqual(
      ['abschnitt', 'ffa', 'ffb'].sort()
    );
    expect(descendantGroupIds('ffa', groups)).toEqual([]);
  });

  it('terminates on a cycle', () => {
    const cyclic = [g('a', 'A', 'b'), g('b', 'B', 'a')];
    expect(descendantGroupIds('a', cyclic)).toEqual(['b']);
  });
});

describe('withAncestorGroups', () => {
  it('adds every parent of every group once', () => {
    expect(withAncestorGroups(['ffa', 'ffb'], groups)).toEqual([
      'ffa',
      'ffb',
      'abschnitt',
      'bezirk',
    ]);
  });

  it('leaves groups without parents alone', () => {
    expect(withAncestorGroups(['solo'], groups)).toEqual(['solo']);
  });
});

describe('impliedGroupIds', () => {
  it('are all parents of the selected groups', () => {
    expect([...impliedGroupIds(['ffa', 'solo'], groups)].sort()).toEqual([
      'abschnitt',
      'bezirk',
    ]);
  });
});

describe('isValidParent', () => {
  it('allows no parent', () => {
    expect(isValidParent('ffa', undefined, groups)).toBe(true);
    expect(isValidParent('ffa', null, groups)).toBe(true);
  });

  it('allows an existing group outside the own subtree', () => {
    expect(isValidParent('solo', 'ffa', groups)).toBe(true);
    expect(isValidParent(undefined, 'bezirk', groups)).toBe(true);
  });

  it('rejects itself, a descendant and an unknown group', () => {
    expect(isValidParent('abschnitt', 'abschnitt', groups)).toBe(false);
    expect(isValidParent('bezirk', 'ffa', groups)).toBe(false);
    expect(isValidParent('ffa', 'unknown', groups)).toBe(false);
  });

  it('rejects groups that are no tenant', () => {
    expect(
      isValidParent('ffa', 'allUsers', [...groups, g('allUsers', 'Alle')])
    ).toBe(false);
    expect(isValidParent('allUsers', 'bezirk', groups)).toBe(false);
  });
});

describe('orderGroupsAsTree', () => {
  it('puts children directly below their parent, sorted by name', () => {
    const shuffled = [groups[3], groups[4], groups[2], groups[0], groups[1]];
    expect(
      orderGroupsAsTree(shuffled).map(({ group, depth }) => [group.id, depth])
    ).toEqual([
      ['bezirk', 0],
      ['abschnitt', 1],
      ['ffa', 2],
      ['ffb', 2],
      ['solo', 0],
    ]);
  });

  it('treats a group whose parent is missing as root', () => {
    expect(
      orderGroupsAsTree([g('ffa', 'FF Alpha', 'abschnitt')]).map(
        ({ group, depth }) => [group.id, depth]
      )
    ).toEqual([['ffa', 0]]);
  });

  it('keeps every group of a cycle', () => {
    const cyclic = [g('a', 'A', 'b'), g('b', 'B', 'a'), g('c', 'C')];
    expect(
      orderGroupsAsTree(cyclic)
        .map(({ group }) => group.id)
        .sort()
    ).toEqual(['a', 'b', 'c']);
  });

  it('uses a custom comparator among siblings', () => {
    expect(
      orderGroupsAsTree(groups, (a, b) => b.name.localeCompare(a.name)).map(
        ({ group }) => group.id
      )
    ).toEqual(['solo', 'bezirk', 'abschnitt', 'ffb', 'ffa']);
  });
});

describe('planAncestorMemberships', () => {
  it('lists the missing parent groups per user', () => {
    expect(
      planAncestorMemberships(
        [
          { uid: 'u1', groupIds: ['ffa'] },
          { uid: 'u2', groupIds: ['ffb', 'abschnitt', 'bezirk'] },
          { uid: 'u3', groupIds: ['solo'] },
        ],
        groups
      )
    ).toEqual([{ uid: 'u1', groupIds: ['abschnitt', 'bezirk'] }]);
  });
});
