import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  permissionRequiredMock,
  adminRequiredMock,
  changeUserRolesMock,
  listUsersMock,
  userDocs,
  groupDocs,
  getGroupsMock,
} = vi.hoisted(() => ({
  getGroupsMock: vi.fn(async () => [] as unknown[]),
  permissionRequiredMock: vi.fn(),
  adminRequiredMock: vi.fn(),
  changeUserRolesMock: vi.fn(),
  listUsersMock: vi.fn(),
  userDocs: {} as Record<string, Record<string, unknown> | undefined>,
  groupDocs: {} as Record<string, Record<string, unknown> | undefined>,
}));

vi.mock('../auth', () => ({
  actionPermissionRequired: (groupId: string, perm: string) =>
    permissionRequiredMock(groupId, perm),
  actionAdminRequired: () => adminRequiredMock(),
}));
vi.mock('../../server/auth/changeUserRoles', () => ({
  changeUserRoles: (uid: string, change: unknown, user: unknown) =>
    changeUserRolesMock(uid, change, user),
}));
vi.mock('./groupHelpers', () => ({
  getGroups: () => getGroupsMock(),
}));
vi.mock('../api/users/listUsers', () => ({
  listUsers: () => listUsersMock(),
}));
vi.mock('../../server/firebase/admin', () => ({
  firestore: {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          const data = name === 'user' ? userDocs[id] : groupDocs[id];
          return { exists: data !== undefined, data: () => data };
        },
      }),
    }),
  },
}));

import {
  addMemberAction,
  getMemberRolesAction,
  removeMemberAction,
  setMemberRoleAction,
} from './memberRolesActions';

function session(user: Record<string, unknown>) {
  return { user: { id: 'actor', isAuthorized: true, ...user } };
}

const GROUP_ADMIN = session({ groupRoles: { ffnd: ['gruppenadmin'] } });
const ADMIN = session({ isAdmin: true, groupRoles: {} });

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(userDocs)) delete userDocs[key];
  for (const key of Object.keys(groupDocs)) delete groupDocs[key];
  groupDocs.ffnd = { name: 'FF Neusiedl am See' };
  permissionRequiredMock.mockResolvedValue(GROUP_ADMIN);
  adminRequiredMock.mockResolvedValue(ADMIN);
  changeUserRolesMock.mockImplementation(
    async (
      uid: string,
      change: { kind: string; groupId: string; roles?: string[]; role?: string; enabled?: boolean },
    ) => {
      if (change.kind !== 'toggleRole') {
        return { [change.groupId]: change.roles ?? [] };
      }
      const current =
        (userDocs[uid]?.groupRoles as Record<string, string[]> | undefined)?.[
          change.groupId
        ] ?? [];
      const others = current.filter((r) => r !== change.role);
      return {
        [change.groupId]: (change.enabled ? [...others, change.role!] : others).sort(),
      };
    },
  );
  listUsersMock.mockResolvedValue([
    { uid: 'u1', displayName: 'Anna', groupRoles: { ffnd: ['geraetemeister'] } },
    { uid: 'u2', displayName: 'Bert', groupRoles: {} },
  ]);
});

describe('getMemberRolesAction', () => {
  it('verlangt rollen.assign in der Gruppe', async () => {
    permissionRequiredMock.mockRejectedValue(new Error('forbidden'));

    await expect(getMemberRolesAction('ffnd')).rejects.toThrow('forbidden');
    expect(permissionRequiredMock).toHaveBeenCalledWith('ffnd', 'rollen.assign');
    expect(listUsersMock).not.toHaveBeenCalled();
  });

  it('liefert dem Gruppen-Admin die Mitglieder, aber keine Kandidaten', async () => {
    // Die übrigen Benutzer der App gehen einen Gruppen-Admin nichts an;
    // aufnehmen darf ohnehin nur der globale Admin.
    const data = await getMemberRolesAction('ffnd');

    expect(data.groupName).toBe('FF Neusiedl am See');
    expect(data.members.map((m) => m.uid)).toEqual(['u1']);
    expect(data.candidates).toEqual([]);
    expect(data.assignable).toEqual({
      gruppenadmin: false,
      geraetemeister: true,
      bekleidungswart: true,
      kostenersatz: false,
    });
    expect(data.canManageMembers).toBe(false);
  });

  it('liefert dem globalen Admin auch die Kandidaten', async () => {
    permissionRequiredMock.mockResolvedValue(ADMIN);

    const data = await getMemberRolesAction('ffnd');

    expect(data.candidates.map((c) => c.uid)).toEqual(['u2']);
    expect(data.canManageMembers).toBe(true);
  });

  it('scheitert an einer unbekannten Gruppe', async () => {
    await expect(getMemberRolesAction('gibtsnicht')).rejects.toThrow(
      /does not exist/,
    );
  });
});

describe('setMemberRoleAction', () => {
  beforeEach(() => {
    userDocs.u1 = { groupRoles: { ffnd: ['kostenersatz'] } };
  });

  it('vergibt eine Rolle über den Rollen-Schreibweg', async () => {
    const result = await setMemberRoleAction('ffnd', 'u1', 'geraetemeister', true);

    expect(permissionRequiredMock).toHaveBeenCalledWith('ffnd', 'rollen.assign');
    // Nur die eine Rolle, umgeschaltet in der Transaktion: Eine fertige Liste
    // gäbe bei gleichzeitigem Entzug die entzogene Rolle zurück.
    expect(changeUserRolesMock).toHaveBeenCalledWith(
      'u1',
      {
        kind: 'toggleRole',
        groupId: 'ffnd',
        role: 'geraetemeister',
        enabled: true,
      },
      userDocs.u1,
    );
    expect(result).toEqual({
      success: true,
      roles: ['geraetemeister', 'kostenersatz'],
    });
  });

  it('lässt den Gruppen-Admin keine Rolle entziehen, deren Rechte er nicht hat', async () => {
    const result = await setMemberRoleAction('ffnd', 'u1', 'kostenersatz', false);

    expect(result).toEqual({ success: false, error: 'forbidden' });
    expect(changeUserRolesMock).not.toHaveBeenCalled();
  });

  it('lässt nur den globalen Admin die Rolle gruppenadmin vergeben', async () => {
    expect(
      await setMemberRoleAction('ffnd', 'u1', 'gruppenadmin', true),
    ).toEqual({ success: false, error: 'forbidden' });

    permissionRequiredMock.mockResolvedValue(ADMIN);
    expect(
      await setMemberRoleAction('ffnd', 'u1', 'gruppenadmin', true),
    ).toMatchObject({ success: true });
  });

  it('lehnt unbekannte Rollen ab', async () => {
    expect(
      await setMemberRoleAction('ffnd', 'u1', 'superuser' as never, true),
    ).toEqual({ success: false, error: 'invalidRole' });
  });

  it('vergibt keine Rolle an Nicht-Mitglieder', async () => {
    // Sonst nähme ein Gruppen-Admin über die Rollenvergabe Benutzer auf.
    userDocs.u3 = { groupRoles: { other: [] } };

    expect(
      await setMemberRoleAction('ffnd', 'u3', 'bekleidungswart', true),
    ).toEqual({ success: false, error: 'notAMember' });
    expect(
      await setMemberRoleAction('ffnd', 'nobody', 'bekleidungswart', true),
    ).toEqual({ success: false, error: 'notAMember' });
    expect(changeUserRolesMock).not.toHaveBeenCalled();
  });

  it('bearbeitet keinen nicht migrierten Benutzer mit altem Kostenersatz', async () => {
    userDocs.u4 = { groups: ['allUsers', 'ffnd', 'kostenersatz'] };

    expect(
      await setMemberRoleAction('ffnd', 'u4', 'geraetemeister', true),
    ).toEqual({ success: false, error: 'notMigrated' });
    expect(changeUserRolesMock).not.toHaveBeenCalled();
  });

  it('schreibt nichts, wenn die Rolle schon so steht', async () => {
    const result = await setMemberRoleAction('ffnd', 'u1', 'geraetemeister', false);

    expect(result).toEqual({ success: true, roles: ['kostenersatz'] });
    expect(changeUserRolesMock).not.toHaveBeenCalled();
  });
});

describe('addMemberAction', () => {
  it('ist dem globalen Admin vorbehalten', async () => {
    adminRequiredMock.mockRejectedValue(new Error('admin required'));

    await expect(addMemberAction('ffnd', 'u2')).rejects.toThrow('admin required');
    expect(changeUserRolesMock).not.toHaveBeenCalled();
  });

  it('nimmt einen Benutzer ohne Rolle auf', async () => {
    userDocs.u2 = { groupRoles: {} };

    expect(await addMemberAction('ffnd', 'u2')).toEqual({ success: true });
    expect(changeUserRolesMock).toHaveBeenCalledWith(
      'u2',
      { kind: 'addMember', groupId: 'ffnd' },
      userDocs.u2,
    );
  });

  it('nimmt keinen nicht migrierten Benutzer mit altem Kostenersatz auf', async () => {
    userDocs.u4 = { groups: ['allUsers', 'other', 'kostenersatz'] };

    expect(await addMemberAction('ffnd', 'u4')).toEqual({
      success: false,
      error: 'notMigrated',
    });
    expect(changeUserRolesMock).not.toHaveBeenCalled();
  });

  it('nimmt keinen Einsatz-Gast auf', async () => {
    userDocs.g1 = { firecall: 'fc1', groups: ['allUsers'] };

    expect(await addMemberAction('ffnd', 'g1')).toEqual({
      success: false,
      error: 'firecallGuest',
    });
  });

  it('lehnt Pseudo-Gruppen und unbekannte Gruppen ab', async () => {
    userDocs.u2 = { groupRoles: {} };

    await expect(addMemberAction('allUsers', 'u2')).rejects.toThrow(
      /not a valid group/,
    );
    await expect(addMemberAction('gibtsnicht', 'u2')).rejects.toThrow(
      /does not exist/,
    );
  });
});

describe('Gruppenhierarchie', () => {
  const HIERARCHY = [
    { id: 'abschnitt', name: 'Abschnitt' },
    { id: 'ffnd', name: 'FF', parentId: 'abschnitt' },
    { id: 'zug', name: 'Zug', parentId: 'ffnd' },
  ];

  it('nimmt ein neues Mitglied auch in die fehlenden Elterngruppen auf', async () => {
    getGroupsMock.mockResolvedValueOnce(HIERARCHY);
    groupDocs.zug = { name: 'Zug' };
    userDocs.u2 = { groupRoles: { abschnitt: [] } };

    expect(await addMemberAction('zug', 'u2')).toEqual({ success: true });
    expect(changeUserRolesMock.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      ['u2', { kind: 'addMember', groupId: 'zug' }],
      ['u2', { kind: 'addMember', groupId: 'ffnd' }],
    ]);
  });

  it('entfernt kein Mitglied, das über eine Untergruppe dazugehört', async () => {
    getGroupsMock.mockResolvedValueOnce(HIERARCHY);
    userDocs.u1 = { groupRoles: { abschnitt: [], ffnd: [], zug: [] } };

    expect(await removeMemberAction('ffnd', 'u1')).toEqual({
      success: false,
      error: 'memberOfSubgroup',
    });
    expect(changeUserRolesMock).not.toHaveBeenCalled();
  });
});

describe('removeMemberAction', () => {
  it('ist dem globalen Admin vorbehalten', async () => {
    adminRequiredMock.mockRejectedValue(new Error('admin required'));

    await expect(removeMemberAction('ffnd', 'u1')).rejects.toThrow(
      'admin required',
    );
  });

  it('entfernt das Mitglied samt Rollen', async () => {
    userDocs.u1 = { groupRoles: { ffnd: ['geraetemeister'] } };

    expect(await removeMemberAction('ffnd', 'u1')).toEqual({ success: true });
    expect(changeUserRolesMock).toHaveBeenCalledWith(
      'u1',
      { kind: 'removeMember', groupId: 'ffnd' },
      userDocs.u1,
    );
  });

  it('entfernt keinen nicht migrierten Benutzer mit altem Kostenersatz', async () => {
    userDocs.u4 = { groups: ['allUsers', 'ffnd', 'kostenersatz'] };

    expect(await removeMemberAction('ffnd', 'u4')).toEqual({
      success: false,
      error: 'notMigrated',
    });
    expect(changeUserRolesMock).not.toHaveBeenCalled();
  });

  it('meldet unbekannte Benutzer', async () => {
    expect(await removeMemberAction('ffnd', 'nobody')).toEqual({
      success: false,
      error: 'unknownUser',
    });
  });
});
