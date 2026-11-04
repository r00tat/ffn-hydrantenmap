import { describe, expect, it } from 'vitest';
import { atemschutzSearchGroupIds } from './atemschutzSearchGroups';

describe('atemschutzSearchGroupIds', () => {
  it('stellt die Arbeitsgruppe voran und hängt die übrigen Mitgliedschaften an', () => {
    expect(
      atemschutzSearchGroupIds('bezirk', {
        groupRoles: { ffnd: [], bezirk: [], allUsers: [] },
      }),
    ).toEqual(['bezirk', 'ffnd']);
  });

  it('nimmt die Arbeitsgruppe auch ohne Mitgliedschaft (globaler Admin)', () => {
    expect(atemschutzSearchGroupIds('bezirk', { groupRoles: {} })).toEqual([
      'bezirk',
    ]);
  });

  it('ohne Arbeitsgruppe sucht es nirgends', () => {
    expect(
      atemschutzSearchGroupIds(undefined, { groupRoles: { ffnd: [] } }),
    ).toEqual([]);
  });

  it('nie in Nicht-Mandanten', () => {
    expect(
      atemschutzSearchGroupIds('kostenersatz', {
        groupRoles: { kostenersatz: [] },
      }),
    ).toEqual([]);
  });
});
