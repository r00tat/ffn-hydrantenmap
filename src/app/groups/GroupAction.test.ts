import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  actionAdminRequiredMock,
  changeUserRolesMock,
  usersGetMock,
  groupSetMock,
  groupAddMock,
} = vi.hoisted(() => ({
  actionAdminRequiredMock: vi.fn(),
  changeUserRolesMock: vi.fn(),
  usersGetMock: vi.fn(),
  groupSetMock: vi.fn(),
  groupAddMock: vi.fn(),
}));

vi.mock('../auth', () => ({
  actionAdminRequired: () => actionAdminRequiredMock(),
  actionUserRequired: () => actionAdminRequiredMock(),
}));
vi.mock('../../server/auth/changeUserRoles', () => ({
  changeUserRoles: (uid: string, change: unknown, user: unknown) =>
    changeUserRolesMock(uid, change, user),
}));
vi.mock('../../server/firebase/admin', () => ({
  firestore: {
    collection: (name: string) => {
      if (name === 'user') {
        return { get: () => usersGetMock() };
      }
      return {
        doc: (id: string) => ({ id, set: groupSetMock }),
        add: groupAddMock,
      };
    },
  },
}));

import { updateGroupAction } from './GroupAction';

function userDoc(id: string, data: Record<string, unknown>) {
  return { id, data: () => data };
}

const GROUP = { id: 'ffnd', name: 'FF Neusiedl am See' };

beforeEach(() => {
  vi.clearAllMocks();
  actionAdminRequiredMock.mockResolvedValue({ user: { id: 'a1' } });
  groupSetMock.mockResolvedValue(undefined);
  changeUserRolesMock.mockResolvedValue({});
});

describe('updateGroupAction', () => {
  it('verlangt den globalen Admin', async () => {
    actionAdminRequiredMock.mockRejectedValue(new Error('admin required'));

    await expect(updateGroupAction(GROUP, [], [])).rejects.toThrow(
      'admin required',
    );
    expect(changeUserRolesMock).not.toHaveBeenCalled();
  });

  it('schreibt Mitgliedschaft und Gruppen-Admin über den Rollen-Schreibweg', async () => {
    const u1 = { groupRoles: {} };
    const u2 = { groupRoles: { ffnd: ['gruppenadmin', 'kostenersatz'] } };
    const u3 = { groupRoles: { ffnd: [] } };
    usersGetMock.mockResolvedValue({
      docs: [userDoc('u1', u1), userDoc('u2', u2), userDoc('u3', u3)],
    });

    // u1 kommt als Admin dazu, u2 verliert die Admin-Rolle, u3 scheidet aus.
    await updateGroupAction(GROUP, ['u1', 'u2'], ['u1']);

    expect(changeUserRolesMock).toHaveBeenCalledTimes(3);
    expect(changeUserRolesMock).toHaveBeenCalledWith(
      'u1',
      { kind: 'addMember', groupId: 'ffnd', roles: ['gruppenadmin'] },
      u1,
    );
    expect(changeUserRolesMock).toHaveBeenCalledWith(
      'u2',
      { kind: 'toggleRole', groupId: 'ffnd', role: 'gruppenadmin', enabled: false },
      u2,
    );
    expect(changeUserRolesMock).toHaveBeenCalledWith(
      'u3',
      { kind: 'removeMember', groupId: 'ffnd' },
      u3,
    );
  });

  it('schreibt nichts an Benutzern, wenn sich nichts ändert', async () => {
    usersGetMock.mockResolvedValue({
      docs: [userDoc('u1', { groupRoles: { ffnd: ['gruppenadmin'] } })],
    });

    await updateGroupAction(GROUP, ['u1'], ['u1']);

    expect(changeUserRolesMock).not.toHaveBeenCalled();
  });

  it('nimmt Mitglieder einer neu angelegten Gruppe unter deren neuer ID auf', async () => {
    groupAddMock.mockResolvedValue({ id: 'neu' });
    usersGetMock.mockResolvedValue({
      docs: [userDoc('u1', { groupRoles: {} })],
    });

    const result = await updateGroupAction({ name: 'Neu' }, ['u1'], []);

    expect(result).toEqual({ groupId: 'neu', notMigrated: [] });
    expect(changeUserRolesMock).toHaveBeenCalledWith(
      'u1',
      { kind: 'addMember', groupId: 'neu', roles: [] },
      expect.anything(),
    );
  });

  it('übergeht nicht migrierte Benutzer mit altem Kostenersatz und meldet sie', async () => {
    // Die Umrechnung gäbe ihm Kostenersatz in jeder Gruppe, und Schritt 2
    // überspränge ihn danach samt der Auswahl je Gruppe.
    const legacy = { groups: ['allUsers', 'other', 'kostenersatz'] };
    const u2 = { groupRoles: {} };
    usersGetMock.mockResolvedValue({
      docs: [userDoc('u1', legacy), userDoc('u2', u2)],
    });

    const result = await updateGroupAction(GROUP, ['u1', 'u2'], []);

    expect(result).toEqual({ groupId: 'ffnd', notMigrated: ['u1'] });
    expect(changeUserRolesMock).toHaveBeenCalledTimes(1);
    expect(changeUserRolesMock).toHaveBeenCalledWith(
      'u2',
      { kind: 'addMember', groupId: 'ffnd', roles: [] },
      u2,
    );
  });

  it('speichert Pseudo-Gruppen, ändert dort aber keine Mitgliedschaft', async () => {
    // `allUsers` hat jeder, `kostenersatz` ist eine Rolle je Gruppe — eine
    // Mitgliedschaft darin gibt es nicht mehr.
    usersGetMock.mockResolvedValue({
      docs: [userDoc('u1', { groupRoles: {} })],
    });

    await updateGroupAction({ id: 'kostenersatz', name: 'K' }, ['u1'], ['u1']);

    expect(groupSetMock).toHaveBeenCalled();
    expect(changeUserRolesMock).not.toHaveBeenCalled();
  });
});
