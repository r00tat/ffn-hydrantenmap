import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  adminMock,
  userMock,
  changeUserRolesMock,
  configs,
  setMock,
  deleteMock,
  usersGetMock,
  groupNames,
} = vi.hoisted(() => ({
  adminMock: vi.fn(),
  userMock: vi.fn(),
  changeUserRolesMock: vi.fn(),
  configs: new Map<string, Record<string, unknown>>(),
  setMock: vi.fn(),
  deleteMock: vi.fn(),
  usersGetMock: vi.fn(),
  groupNames: new Map<string, string>(),
}));

vi.mock('../auth', () => ({
  actionAdminRequired: () => adminMock(),
  actionUserRequired: () => userMock(),
}));
vi.mock('../../server/blaulichtsms/encryption', () => ({
  encryptPassword: async (v: string) => `enc:${v}`,
}));
vi.mock('../../server/auth/changeUserRoles', () => ({
  changeUserRoles: (uid: string, change: unknown) =>
    changeUserRolesMock(uid, change),
}));
vi.mock('../../server/firebase/admin', () => ({
  firestore: {
    getAll: async (...refs: { id: string }[]) =>
      refs.map(({ id }) => ({
        exists: groupNames.has(id),
        data: () => ({ name: groupNames.get(id) }),
      })),
    collection: (name: string) => {
      if (name === 'user') return { get: () => usersGetMock() };
      if (name === 'groups') return { doc: (id: string) => ({ id }) };
      return {
        get: async () => ({
          docs: [...configs].map(([id, data]) => ({ id, data: () => data })),
        }),
        doc: (id: string) => ({
          get: async () => ({
            exists: configs.has(id),
            data: () => configs.get(id),
          }),
          set: (data: unknown) => setMock(id, data),
          delete: () => deleteMock(id),
        }),
      };
    },
  },
}));

import {
  getGroupsWithOebfvConfig,
  getOebfvTokenGroups,
  transferOebfvTokenAction,
} from './configActions';

const userDoc = (id: string, data: Record<string, unknown>) => ({
  id,
  data: () => data,
});

beforeEach(() => {
  vi.clearAllMocks();
  configs.clear();
  groupNames.clear();
  adminMock.mockResolvedValue({ user: { email: 'admin@example.org' } });
});

describe('getGroupsWithOebfvConfig', () => {
  it('liefert nur Gruppen mit Token, in denen der Benutzer die Kennzeichenabfrage hat', async () => {
    configs.set('ffnd', { tokenEncrypted: 'x' });
    configs.set('ffxy', { tokenEncrypted: 'y' });
    configs.set('leer', {});
    userMock.mockResolvedValue({
      user: {
        groupRoles: { ffnd: ['kennzeichenabfrage'], ffxy: ['kostenersatz'] },
      },
    });

    expect(await getGroupsWithOebfvConfig()).toEqual(['ffnd']);
  });

  it('liefert dem Admin alle Gruppen mit Token', async () => {
    configs.set('ffnd', { tokenEncrypted: 'x' });
    configs.set('ffxy', { tokenEncrypted: 'y' });
    userMock.mockResolvedValue({ user: { isAdmin: true } });

    expect(await getGroupsWithOebfvConfig()).toEqual(['ffnd', 'ffxy']);
  });
});

describe('getOebfvTokenGroups', () => {
  it('liefert die Gruppen mit Token samt Namen, auch wenn die Gruppe fehlt', async () => {
    configs.set('kz', { tokenEncrypted: 'x' });
    configs.set('weg', { tokenEncrypted: 'y' });
    configs.set('leer', {});
    groupNames.set('kz', 'Kennzeichenabfrage');

    expect(await getOebfvTokenGroups()).toEqual([
      { groupId: 'kz', name: 'Kennzeichenabfrage' },
      { groupId: 'weg' },
    ]);
  });
});

describe('transferOebfvTokenAction', () => {
  it('verlangt den globalen Admin', async () => {
    adminMock.mockRejectedValue(new Error('admin required'));
    await expect(transferOebfvTokenAction('kz', 'ffnd')).rejects.toThrow(
      'admin required',
    );
    expect(setMock).not.toHaveBeenCalled();
  });

  it('zieht den Token um und vergibt den bisherigen Abfragern die Rolle in der Zielgruppe', async () => {
    configs.set('kz', { tokenEncrypted: 'secret' });
    usersGetMock.mockResolvedValue({
      docs: [
        userDoc('a', { groupRoles: { kz: [], ffnd: [] } }),
        userDoc('b', { groupRoles: { kz: [], ffnd: ['kennzeichenabfrage'] } }),
        userDoc('c', { groupRoles: { kz: [] } }),
        userDoc('d', { groupRoles: { ffnd: [] } }),
      ],
    });

    const result = await transferOebfvTokenAction('kz', 'ffnd');

    expect(setMock).toHaveBeenCalledWith(
      'ffnd',
      expect.objectContaining({
        groupId: 'ffnd',
        tokenEncrypted: 'secret',
        updatedBy: 'admin@example.org',
      }),
    );
    expect(deleteMock).toHaveBeenCalledWith('kz');
    expect(changeUserRolesMock.mock.calls).toEqual([
      [
        'a',
        {
          kind: 'toggleRole',
          groupId: 'ffnd',
          role: 'kennzeichenabfrage',
          enabled: true,
        },
      ],
    ]);
    expect(result).toEqual({
      grant: ['a'],
      alreadyGranted: ['b'],
      notMember: ['c'],
      notMigrated: [],
    });
  });

  it('überschreibt keinen vorhandenen Token der Zielgruppe', async () => {
    configs.set('kz', { tokenEncrypted: 'secret' });
    configs.set('ffnd', { tokenEncrypted: 'other' });

    await expect(transferOebfvTokenAction('kz', 'ffnd')).rejects.toThrow(
      'already has a token',
    );
    expect(setMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('lehnt eine Quellgruppe ohne Token und Pseudo-Gruppen ab', async () => {
    await expect(transferOebfvTokenAction('kz', 'ffnd')).rejects.toThrow(
      'has no token',
    );
    await expect(transferOebfvTokenAction('kz', 'allUsers')).rejects.toThrow(
      'not a valid group',
    );
  });

  it('meldet nicht migrierte Benutzer, statt sie zu ändern', async () => {
    configs.set('kz', { tokenEncrypted: 'secret' });
    usersGetMock.mockResolvedValue({
      docs: [userDoc('u', { groups: ['allUsers', 'ffnd', 'kz', 'kostenersatz'] })],
    });

    const result = await transferOebfvTokenAction('kz', 'ffnd');

    expect(result.notMigrated).toEqual(['u']);
    expect(changeUserRolesMock).not.toHaveBeenCalled();
  });
});
