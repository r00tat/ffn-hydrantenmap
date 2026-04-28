import { describe, it, expect } from 'vitest';
import { filterGroupsByMembership } from './groupFilter';

describe('filterGroupsByMembership', () => {
  it('returns all groups for admin even if not member', () => {
    expect(filterGroupsByMembership(['ffnd', 'test'], [], true)).toEqual([
      'ffnd',
      'test',
    ]);
  });

  it('returns only groups the non-admin user is member of', () => {
    expect(
      filterGroupsByMembership(['ffnd', 'test', 'other'], ['test'], false),
    ).toEqual(['test']);
  });

  it('returns empty when non-admin user has no matching groups', () => {
    expect(filterGroupsByMembership(['ffnd'], ['other'], false)).toEqual([]);
  });

  it('returns empty when non-admin user has no groups', () => {
    expect(filterGroupsByMembership(['ffnd'], [], false)).toEqual([]);
  });

  it('preserves order of configured groups', () => {
    expect(
      filterGroupsByMembership(['z', 'a', 'm'], ['a', 'm', 'z'], false),
    ).toEqual(['z', 'a', 'm']);
  });

  it('does not mutate the input array', () => {
    const input = ['ffnd', 'test'];
    filterGroupsByMembership(input, ['test'], false);
    expect(input).toEqual(['ffnd', 'test']);
  });

  it('returns a copy for admin (no shared reference)', () => {
    const input = ['ffnd'];
    const result = filterGroupsByMembership(input, [], true);
    expect(result).not.toBe(input);
    expect(result).toEqual(input);
  });
});
