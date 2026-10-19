import { describe, it, expect } from 'vitest';
import { sortGroupsForUser, ALL_USERS_GROUP_ID } from './groupSort';
import type { Group } from './groupTypes';

const g = (id: string, name: string): Group => ({ id, name });

describe('sortGroupsForUser', () => {
  it('puts allUsers at the end of an alphabetically sorted list', () => {
    const result = sortGroupsForUser([
      g(ALL_USERS_GROUP_ID, 'Alle Benutzer'),
      g('ffnd', 'FF Neusiedl am See'),
      g('test', 'Test'),
    ]);
    expect(result.map((x) => x.id)).toEqual(['ffnd', 'test', ALL_USERS_GROUP_ID]);
  });

  it('preserves alphabetical order among non-allUsers groups', () => {
    const result = sortGroupsForUser([
      g('z', 'Zulu'),
      g('a', 'Alpha'),
      g('m', 'Mike'),
    ]);
    expect(result.map((x) => x.id)).toEqual(['a', 'm', 'z']);
  });

  it('handles a list without allUsers', () => {
    const result = sortGroupsForUser([g('b', 'Bravo'), g('a', 'Alpha')]);
    expect(result.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('handles a list containing only allUsers', () => {
    const result = sortGroupsForUser([g(ALL_USERS_GROUP_ID, 'Alle Benutzer')]);
    expect(result.map((x) => x.id)).toEqual([ALL_USERS_GROUP_ID]);
  });

  it('does not mutate the input array', () => {
    const input = [
      g(ALL_USERS_GROUP_ID, 'Alle Benutzer'),
      g('ffnd', 'FF Neusiedl am See'),
    ];
    sortGroupsForUser(input);
    expect(input.map((x) => x.id)).toEqual([ALL_USERS_GROUP_ID, 'ffnd']);
  });

  it('uses locale-aware compare for German umlauts', () => {
    const result = sortGroupsForUser([
      g('z', 'Zulu'),
      g('a', 'Älpler'),
      g('b', 'Bravo'),
    ]);
    expect(result.map((x) => x.id)).toEqual(['a', 'b', 'z']);
  });

  it('puts sub groups directly below their parent', () => {
    const result = sortGroupsForUser([
      g(ALL_USERS_GROUP_ID, 'Alle Benutzer'),
      { id: 'ffa', name: 'Alpha', parentId: 'abschnitt' },
      g('zz', 'Zulu'),
      g('abschnitt', 'Abschnitt'),
    ]);
    expect(result.map((x) => x.id)).toEqual([
      'abschnitt',
      'ffa',
      'zz',
      ALL_USERS_GROUP_ID,
    ]);
  });
});
