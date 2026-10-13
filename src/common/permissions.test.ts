import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  ROLES,
  ROLE_IDS,
  ROLES_CATALOG_VERSION,
  can,
  canAny,
  canAssignRole,
  derivePermissionFields,
  isMember,
  isRoleId,
  legacyToGroupRoles,
  memberGroupIds,
  permissionsFor,
  type PermissionUser,
} from './permissions';
import { NON_TENANT_GROUP_IDS } from './tenantGroups';

const admin: PermissionUser = { isAdmin: true, groupRoles: {} };
const member: PermissionUser = { groupRoles: { ffnd: [] } };
const groupAdmin: PermissionUser = { groupRoles: { ffnd: ['gruppenadmin'] } };
const geraetemeister: PermissionUser = {
  groupRoles: { ffnd: ['geraetemeister'], ffxy: [] },
};

describe('Katalog', () => {
  it('enthält nur Rechte aus PERMISSIONS', () => {
    for (const roles of Object.values(ROLES)) {
      for (const perm of roles) {
        expect(PERMISSIONS).toContain(perm);
      }
    }
  });

  it('gibt dem Gruppen-Admin keinen Kostenersatz', () => {
    expect(ROLES.gruppenadmin).not.toContain('kostenersatz.use');
  });

  it('listet alle Rollen in ROLE_IDS', () => {
    expect([...ROLE_IDS].sort()).toEqual(Object.keys(ROLES).sort());
  });

  it('hat eine positive Katalogversion', () => {
    expect(ROLES_CATALOG_VERSION).toBeGreaterThanOrEqual(1);
  });

  it('erkennt Rollen-IDs', () => {
    expect(isRoleId('geraetemeister')).toBe(true);
    expect(isRoleId('admin')).toBe(false);
    expect(isRoleId(undefined)).toBe(false);
    expect(isRoleId('toString')).toBe(false);
  });
});

describe('isMember', () => {
  it('ist wahr für einen Schlüssel in groupRoles, auch mit leeren Rollen', () => {
    expect(isMember(member, 'ffnd')).toBe(true);
  });

  it('ist falsch ohne Schlüssel', () => {
    expect(isMember(member, 'ffxy')).toBe(false);
    expect(isMember({}, 'ffnd')).toBe(false);
  });

  it('lässt den globalen Admin ohne Mitgliedschaft durch', () => {
    expect(isMember(admin, 'ffnd')).toBe(true);
  });

  it.each(['', ...NON_TENANT_GROUP_IDS])(
    'ist für die Nicht-Mandanten-Gruppe %s immer falsch',
    (groupId) => {
      expect(isMember({ groupRoles: { [groupId]: [] } }, groupId)).toBe(false);
    },
  );

  it('fällt nicht auf geerbte Objekt-Schlüssel herein', () => {
    expect(isMember(member, 'toString')).toBe(false);
    expect(isMember(member, '__proto__')).toBe(false);
  });
});

describe('can', () => {
  it('gibt dem globalen Admin jedes Recht in jeder Gruppe', () => {
    expect(can(admin, 'ffnd', 'kostenersatz.use')).toBe(true);
    expect(can(admin, 'irgendwo', 'gruppe.manage')).toBe(true);
  });

  it('gibt dem blossen Mitglied kein Recht aus dem Katalog', () => {
    for (const perm of PERMISSIONS) {
      expect(can(member, 'ffnd', perm)).toBe(false);
    }
  });

  it('gibt die Rechte der Rolle nur in der Gruppe der Rolle', () => {
    expect(can(geraetemeister, 'ffnd', 'geraete.manage')).toBe(true);
    expect(can(geraetemeister, 'ffnd', 'personal.manage')).toBe(true);
    expect(can(geraetemeister, 'ffxy', 'geraete.manage')).toBe(false);
  });

  it('gibt keine Rechte ausserhalb der Rolle', () => {
    expect(can(geraetemeister, 'ffnd', 'gruppe.manage')).toBe(false);
    expect(can(groupAdmin, 'ffnd', 'kostenersatz.use')).toBe(false);
  });

  it('vereinigt die Rechte mehrerer Rollen', () => {
    const user: PermissionUser = {
      groupRoles: { ffnd: ['bekleidungswart', 'kostenersatz'] },
    };
    expect(can(user, 'ffnd', 'bekleidung.manage')).toBe(true);
    expect(can(user, 'ffnd', 'kostenersatz.use')).toBe(true);
    expect(can(user, 'ffnd', 'geraete.manage')).toBe(false);
  });

  it('ignoriert unbekannte Rollen aus alten Daten', () => {
    const user = {
      groupRoles: { ffnd: ['unbekannt', 'kostenersatz'] },
    } as unknown as PermissionUser;
    expect(can(user, 'ffnd', 'kostenersatz.use')).toBe(true);
    expect(can(user, 'ffnd', 'gruppe.manage')).toBe(false);
  });

  it.each(NON_TENANT_GROUP_IDS)(
    'gibt in der Nicht-Mandanten-Gruppe %s keinem Nicht-Admin ein Recht',
    (groupId) => {
      const user: PermissionUser = { groupRoles: { [groupId]: ['gruppenadmin'] } };
      expect(can(user, groupId, 'gruppe.manage')).toBe(false);
    },
  );
});

describe('canAny', () => {
  it('ist für den globalen Admin immer wahr', () => {
    expect(canAny(admin, 'bekleidung.read')).toBe(true);
  });

  it('findet das Recht in irgendeiner Gruppe', () => {
    expect(canAny(geraetemeister, 'fahrtenbuch.manage')).toBe(true);
    expect(canAny(geraetemeister, 'bekleidung.read')).toBe(false);
    expect(canAny(member, 'fahrtenbuch.manage')).toBe(false);
    expect(canAny({}, 'fahrtenbuch.manage')).toBe(false);
  });

  it('zählt Rollen in Nicht-Mandanten-Gruppen nicht', () => {
    expect(canAny({ groupRoles: { allUsers: ['gruppenadmin'] } }, 'gruppe.manage')).toBe(false);
  });
});

describe('memberGroupIds', () => {
  it('liefert die Schlüssel von groupRoles ohne Nicht-Mandanten', () => {
    expect(
      memberGroupIds({ groupRoles: { ffnd: [], ffxy: ['kostenersatz'], allUsers: [] } }).sort(),
    ).toEqual(['ffnd', 'ffxy']);
    expect(memberGroupIds({})).toEqual([]);
  });

  it('macht den globalen Admin nicht zum Mitglied aller Gruppen', () => {
    expect(memberGroupIds(admin)).toEqual([]);
  });
});

describe('permissionsFor', () => {
  it('liefert die Rechte sortiert und eindeutig', () => {
    const perms = permissionsFor(['gruppenadmin', 'geraetemeister']);
    expect(perms).toEqual([...new Set(perms)].sort());
    expect(perms).toContain('gruppe.manage');
    expect(perms.filter((p) => p === 'geraete.manage')).toHaveLength(1);
  });

  it('liefert für keine Rollen keine Rechte', () => {
    expect(permissionsFor([])).toEqual([]);
  });
});

describe('derivePermissionFields', () => {
  it('leitet Rechte je Gruppe und die Vereinigung ab', () => {
    const fields = derivePermissionFields({
      ffnd: ['kostenersatz'],
      ffxy: ['bekleidungswart'],
      ffzz: [],
    });
    expect(fields.groupPerms).toEqual({
      ffnd: ['kostenersatz.use'],
      ffxy: ['bekleidung.manage', 'bekleidung.read'],
      ffzz: [],
    });
    expect(fields.permsAny).toEqual([
      'bekleidung.manage',
      'bekleidung.read',
      'kostenersatz.use',
    ]);
  });

  it('lässt Nicht-Mandanten-Gruppen aus', () => {
    const fields = derivePermissionFields({ allUsers: ['gruppenadmin'] });
    expect(fields.groupPerms).toEqual({});
    expect(fields.permsAny).toEqual([]);
  });
});

describe('canAssignRole', () => {
  it('lässt den globalen Admin jede Rolle vergeben', () => {
    for (const role of ROLE_IDS) {
      expect(canAssignRole(admin, 'ffnd', role)).toBe(true);
    }
  });

  it('erlaubt die Rolle gruppenadmin nur dem globalen Admin', () => {
    expect(canAssignRole(groupAdmin, 'ffnd', 'gruppenadmin')).toBe(false);
  });

  it('lässt den Gruppen-Admin Rollen vergeben, deren Rechte er selbst hat', () => {
    expect(canAssignRole(groupAdmin, 'ffnd', 'geraetemeister')).toBe(true);
    expect(canAssignRole(groupAdmin, 'ffnd', 'bekleidungswart')).toBe(true);
  });

  it('verweigert dem Gruppen-Admin Kostenersatz, solange er ihn nicht selbst hat', () => {
    expect(canAssignRole(groupAdmin, 'ffnd', 'kostenersatz')).toBe(false);
    const withKostenersatz: PermissionUser = {
      groupRoles: { ffnd: ['gruppenadmin', 'kostenersatz'] },
    };
    expect(canAssignRole(withKostenersatz, 'ffnd', 'kostenersatz')).toBe(true);
  });

  it('verweigert dem Gruppen-Admin fremde Gruppen', () => {
    expect(canAssignRole(groupAdmin, 'ffxy', 'geraetemeister')).toBe(false);
  });

  it('verweigert Benutzern ohne rollen.assign', () => {
    expect(canAssignRole(geraetemeister, 'ffnd', 'geraetemeister')).toBe(false);
    expect(canAssignRole(member, 'ffnd', 'kostenersatz')).toBe(false);
  });
});

describe('legacyToGroupRoles', () => {
  it('macht jede echte Gruppe zur Mitgliedschaft ohne Zusatzrolle', () => {
    expect(legacyToGroupRoles({ groups: ['allUsers', 'ffnd'] })).toEqual({ ffnd: [] });
  });

  it('übernimmt die alten Rollenfelder', () => {
    expect(
      legacyToGroupRoles({
        groups: ['ffnd', 'ffxy'],
        groupAdmin: ['ffnd'],
        fahrtenbuchGeraetemeister: ['ffxy'],
        bekleidungswart: ['ffnd'],
      }),
    ).toEqual({
      ffnd: ['bekleidungswart', 'gruppenadmin'],
      ffxy: ['geraetemeister'],
    });
  });

  it('lässt schlafende Rollen ohne Mitgliedschaft entfallen', () => {
    expect(
      legacyToGroupRoles({
        groups: ['ffnd'],
        groupAdmin: ['ffxy'],
        bekleidungswart: ['ffzz'],
      }),
    ).toEqual({ ffnd: [] });
  });

  it('vergibt Kostenersatz ohne Vorgabe in allen Mitgliedsgruppen', () => {
    expect(legacyToGroupRoles({ groups: ['ffnd', 'ffxy', 'kostenersatz', 'allUsers'] })).toEqual({
      ffnd: ['kostenersatz'],
      ffxy: ['kostenersatz'],
    });
  });

  it('vergibt Kostenersatz mit Vorgabe nur in der Schnittmenge mit der Mitgliedschaft', () => {
    expect(
      legacyToGroupRoles({ groups: ['ffnd', 'ffxy', 'kostenersatz'] }, ['ffxy', 'ffzz']),
    ).toEqual({ ffnd: [], ffxy: ['kostenersatz'] });
  });

  it('nimmt eine explizite Vorgabe auch ohne die Schein-Gruppe', () => {
    expect(legacyToGroupRoles({ groups: ['ffnd'] }, ['ffnd'])).toEqual({
      ffnd: ['kostenersatz'],
    });
  });

  it('vergibt mit leerer Vorgabe keinen Kostenersatz', () => {
    expect(legacyToGroupRoles({ groups: ['ffnd', 'kostenersatz'] }, [])).toEqual({ ffnd: [] });
  });

  it('liefert ohne echte Gruppe keine Mitgliedschaft', () => {
    expect(legacyToGroupRoles({ groups: ['allUsers', 'kostenersatz'] })).toEqual({});
    expect(legacyToGroupRoles({})).toEqual({});
  });
});
