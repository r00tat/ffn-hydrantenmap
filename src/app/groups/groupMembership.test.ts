import { describe, expect, it } from 'vitest';
import {
  inheritedMemberIds,
  planAncestorChanges,
  planGroupRoleChanges,
} from './groupMembership';

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
      // Nur gruppenadmin umschalten: Die übrigen Rollen liest die Transaktion
      // frisch, eine gleichzeitige Änderung daran geht nicht verloren.
      { kind: 'toggleRole', groupId: 'ffnd', role: 'gruppenadmin', enabled: true },
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
      { kind: 'toggleRole', groupId: 'ffnd', role: 'gruppenadmin', enabled: false },
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

const hierarchy = [
  { id: 'abschnitt', name: 'Abschnitt' },
  { id: 'ffa', name: 'FF Alpha', parentId: 'abschnitt' },
  { id: 'ffb', name: 'FF Bravo', parentId: 'abschnitt' },
];

describe('inheritedMemberIds', () => {
  it('liefert die Mitglieder der Untergruppen', () => {
    expect(
      inheritedMemberIds(
        'abschnitt',
        [
          user('u1', { groupRoles: { ffa: [] } }),
          user('u2', { groupRoles: { abschnitt: [] } }),
          user('u3', { groupRoles: { ffb: ['gruppenadmin'] } }),
          user('g1', { groupRoles: { ffa: [] }, firecall: 'f1' }),
        ],
        hierarchy,
      ),
    ).toEqual(['u1', 'u3']);
  });

  it('ist leer für eine Gruppe ohne Untergruppen', () => {
    expect(
      inheritedMemberIds('ffa', [user('u1', { groupRoles: { ffa: [] } })], hierarchy),
    ).toEqual([]);
  });
});

describe('planAncestorChanges', () => {
  it('ergänzt die Elterngruppe für ein neues Mitglied der Untergruppe', () => {
    const users = [user('u1', { groupRoles: {} })];
    const changes = planGroupRoleChanges('ffa', users, ['u1'], []);
    expect(planAncestorChanges(users, changes, hierarchy)).toEqual([
      { uid: 'u1', groupIds: ['abschnitt'] },
    ]);
  });

  it('ergänzt die Elterngruppe für bestehende Mitglieder einer neu eingehängten Gruppe', () => {
    const users = [
      user('u1', { groupRoles: { ffb: [] } }),
      user('u2', { groupRoles: { ffb: [], abschnitt: [] } }),
    ];
    expect(planAncestorChanges(users, [], hierarchy)).toEqual([
      { uid: 'u1', groupIds: ['abschnitt'] },
    ]);
  });

  it('übergeht ausscheidende Mitglieder, Gäste und nicht migrierte Benutzer', () => {
    const users = [
      user('u1', { groupRoles: { ffa: [] } }),
      user('u2', { groupRoles: { ffa: [] } }),
      user('g1', { groupRoles: { ffa: [] }, firecall: 'f1' }),
    ];
    const changes = planGroupRoleChanges('ffa', users, ['u2'], []);
    expect(
      planAncestorChanges(users, changes, hierarchy, new Set(['u2'])),
    ).toEqual([]);
  });
});
