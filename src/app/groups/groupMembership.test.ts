import { describe, expect, it } from 'vitest';
import { planGroupRoleChanges } from './groupMembership';

function user(id: string, data: Record<string, unknown>) {
  return { id, data };
}

describe('planGroupRoleChanges', () => {
  it('nimmt ein neues Mitglied ohne Rolle auf', () => {
    expect(
      planGroupRoleChanges('ffnd', [user('u1', { groupRoles: {} })], ['u1'], []),
    ).toEqual([
      {
        uid: 'u1',
        user: { groupRoles: {} },
        change: { kind: 'addMember', groupId: 'ffnd', roles: [] },
      },
    ]);
  });

  it('nimmt ein neues Mitglied gleich als Gruppen-Admin auf', () => {
    expect(
      planGroupRoleChanges('ffnd', [user('u1', {})], ['u1'], ['u1'])[0].change,
    ).toEqual({ kind: 'addMember', groupId: 'ffnd', roles: ['gruppenadmin'] });
  });

  it('entfernt ein ausscheidendes Mitglied samt aller Rollen der Gruppe', () => {
    // Austritt löscht den Schlüssel — schlafende Rollen gibt es nicht mehr.
    expect(
      planGroupRoleChanges(
        'ffnd',
        [user('u1', { groupRoles: { ffnd: ['gruppenadmin', 'geraetemeister'] } })],
        [],
        [],
      ).map((c) => c.change),
    ).toEqual([{ kind: 'removeMember', groupId: 'ffnd' }]);
  });

  it('vergibt die Rolle gruppenadmin und behält die übrigen Rollen', () => {
    expect(
      planGroupRoleChanges(
        'ffnd',
        [user('u1', { groupRoles: { ffnd: ['kostenersatz'] } })],
        ['u1'],
        ['u1'],
      ).map((c) => c.change),
    ).toEqual([
      {
        kind: 'setGroupRoles',
        groupId: 'ffnd',
        roles: ['gruppenadmin', 'kostenersatz'],
      },
    ]);
  });

  it('entzieht die Rolle gruppenadmin und behält die übrigen Rollen', () => {
    expect(
      planGroupRoleChanges(
        'ffnd',
        [user('u1', { groupRoles: { ffnd: ['gruppenadmin', 'bekleidungswart'] } })],
        ['u1'],
        [],
      ).map((c) => c.change),
    ).toEqual([
      { kind: 'setGroupRoles', groupId: 'ffnd', roles: ['bekleidungswart'] },
    ]);
  });

  it('plant nichts, wenn sich nichts ändert', () => {
    expect(
      planGroupRoleChanges(
        'ffnd',
        [
          user('u1', { groupRoles: { ffnd: ['gruppenadmin'] } }),
          user('u2', { groupRoles: { other: [] } }),
        ],
        ['u1'],
        ['u1'],
      ),
    ).toEqual([]);
  });

  it('macht ein Nicht-Mitglied nicht zum Gruppen-Admin', () => {
    expect(
      planGroupRoleChanges('ffnd', [user('u1', { groupRoles: {} })], [], ['u1']),
    ).toEqual([]);
  });

  it('liest die Mitgliedschaft nicht migrierter Benutzer aus den alten Feldern', () => {
    expect(
      planGroupRoleChanges(
        'ffnd',
        [user('u1', { groups: ['allUsers', 'ffnd'], groupAdmin: ['ffnd'] })],
        ['u1'],
        ['u1'],
      ),
    ).toEqual([]);
  });

  it('übergeht Einsatz-Gäste', () => {
    // Ein Gast hat Zugang zu genau einem Einsatz; Mitglied einer Gruppe darf er
    // nicht werden, sonst sähe er alle Einsätze der Gruppe.
    expect(
      planGroupRoleChanges(
        'ffnd',
        [user('g1', { firecall: 'fc1', groups: ['allUsers'] })],
        ['g1'],
        [],
      ),
    ).toEqual([]);
  });
});
