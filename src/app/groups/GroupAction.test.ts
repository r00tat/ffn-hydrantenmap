import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  actionAdminRequiredMock,
  changeUserRolesMock,
  usersGetMock,
  groupSetMock,
  groupAddMock,
  groupsGetMock,
} = vi.hoisted(() => ({
  groupsGetMock: vi.fn(),
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
        orderBy: () => ({ get: () => groupsGetMock() }),
      };
    },
  },
}));

import { setGroupParentAction, updateGroupAction } from './GroupAction';

function userDoc(id: string, data: Record<string, unknown>) {
  return { id, data: () => data };
}

const GROUP = { id: 'ffnd', name: 'FF Neusiedl am See' };

beforeEach(() => {
  vi.clearAllMocks();
  actionAdminRequiredMock.mockResolvedValue({ user: { id: 'a1' } });
  groupSetMock.mockResolvedValue(undefined);
  changeUserRolesMock.mockResolvedValue({});
  groupsGetMock.mockResolvedValue({ docs: [] });
});

function groupDocs(...groups: { id: string; name: string; parentId?: string }[]) {
  return {
    docs: groups.map(({ id, ...data }) => ({ id, data: () => data })),
  };
}

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

  it('speichert die Elterngruppe', async () => {
    groupsGetMock.mockResolvedValue(
      groupDocs({ id: 'abschnitt', name: 'Abschnitt' }, { id: 'ffnd', name: 'FF' }),
    );
    usersGetMock.mockResolvedValue({ docs: [] });

    await updateGroupAction({ ...GROUP, parentId: 'abschnitt' }, [], []);

    expect(groupSetMock).toHaveBeenCalledWith(
      { name: GROUP.name, parentId: 'abschnitt' },
      { merge: true },
    );
  });

  it('lehnt eine Untergruppe als Elterngruppe ab', async () => {
    groupsGetMock.mockResolvedValue(
      groupDocs(
        { id: 'ffnd', name: 'FF' },
        { id: 'zug', name: 'Zug', parentId: 'ffnd' },
      ),
    );

    await expect(
      updateGroupAction({ ...GROUP, parentId: 'zug' }, [], []),
    ).rejects.toThrow('invalid parent group');
    expect(groupSetMock).not.toHaveBeenCalled();
  });

  it('nimmt neue Mitglieder auch in die Elterngruppen auf', async () => {
    groupsGetMock.mockResolvedValue(
      groupDocs(
        { id: 'bezirk', name: 'Bezirk' },
        { id: 'abschnitt', name: 'Abschnitt', parentId: 'bezirk' },
        { id: 'ffnd', name: 'FF', parentId: 'abschnitt' },
      ),
    );
    const u1 = { groupRoles: { bezirk: [] } };
    usersGetMock.mockResolvedValue({ docs: [userDoc('u1', u1)] });

    await updateGroupAction(GROUP, ['u1'], []);

    expect(changeUserRolesMock.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      ['u1', { kind: 'addMember', groupId: 'ffnd', roles: [] }],
      ['u1', { kind: 'addMember', groupId: 'abschnitt' }],
    ]);
  });

  it('behält Mitglieder einer Untergruppe in der Elterngruppe', async () => {
    groupsGetMock.mockResolvedValue(
      groupDocs(
        { id: 'ffnd', name: 'FF' },
        { id: 'zug', name: 'Zug', parentId: 'ffnd' },
      ),
    );
    usersGetMock.mockResolvedValue({
      docs: [userDoc('u1', { groupRoles: { ffnd: [], zug: [] } })],
    });

    await updateGroupAction(GROUP, [], []);

    expect(changeUserRolesMock).not.toHaveBeenCalled();
  });
});

describe('setGroupParentAction', () => {
  const HIERARCHY = [
    { id: 'bezirk', name: 'Bezirk' },
    { id: 'abschnitt', name: 'Abschnitt', parentId: 'bezirk' },
    { id: 'ffnd', name: 'FF' },
    { id: 'zug', name: 'Zug', parentId: 'ffnd' },
  ];

  it('verlangt den globalen Admin', async () => {
    actionAdminRequiredMock.mockRejectedValue(new Error('admin required'));

    await expect(setGroupParentAction('ffnd', 'abschnitt')).rejects.toThrow(
      'admin required',
    );
    expect(groupSetMock).not.toHaveBeenCalled();
  });

  it('hängt die Gruppe um und nimmt ihre Mitglieder samt Untergruppe in die neuen Elterngruppen auf', async () => {
    groupsGetMock.mockResolvedValue(groupDocs(...HIERARCHY));
    usersGetMock.mockResolvedValue({
      docs: [
        userDoc('u1', { groupRoles: { ffnd: [] } }),
        userDoc('u2', { groupRoles: { ffnd: [], zug: ['geraetemeister'] } }),
        userDoc('u3', { groupRoles: { bezirk: [] } }),
      ],
    });

    const result = await setGroupParentAction('ffnd', 'abschnitt');

    expect(result).toEqual({ groupId: 'ffnd', notMigrated: [] });
    expect(groupSetMock).toHaveBeenCalledWith(
      { parentId: 'abschnitt' },
      { merge: true },
    );
    expect(changeUserRolesMock.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      ['u1', { kind: 'addMember', groupId: 'abschnitt' }],
      ['u1', { kind: 'addMember', groupId: 'bezirk' }],
      ['u2', { kind: 'addMember', groupId: 'abschnitt' }],
      ['u2', { kind: 'addMember', groupId: 'bezirk' }],
    ]);
  });

  it('setzt die Gruppe auf die oberste Ebene, ohne Mitgliedschaften zu entfernen', async () => {
    groupsGetMock.mockResolvedValue(groupDocs(...HIERARCHY));
    usersGetMock.mockResolvedValue({
      docs: [userDoc('u1', { groupRoles: { abschnitt: [], bezirk: [] } })],
    });

    await setGroupParentAction('abschnitt', null);

    expect(groupSetMock).toHaveBeenCalledWith({ parentId: null }, { merge: true });
    expect(changeUserRolesMock).not.toHaveBeenCalled();
  });

  it('lehnt eine eigene Untergruppe als Ziel ab', async () => {
    groupsGetMock.mockResolvedValue(groupDocs(...HIERARCHY));

    await expect(setGroupParentAction('ffnd', 'zug')).rejects.toThrow(
      'invalid parent group',
    );
    expect(groupSetMock).not.toHaveBeenCalled();
  });

  it('meldet nicht migrierte Benutzer, statt sie zu ändern', async () => {
    groupsGetMock.mockResolvedValue(groupDocs(...HIERARCHY));
    usersGetMock.mockResolvedValue({
      docs: [userDoc('u4', { groups: ['allUsers', 'ffnd', 'kostenersatz'] })],
    });

    const result = await setGroupParentAction('ffnd', 'abschnitt');

    expect(result.notMigrated).toEqual(['u4']);
    expect(changeUserRolesMock).not.toHaveBeenCalled();
  });
});
