import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { userMock, configs } = vi.hoisted(() => ({
  userMock: vi.fn(),
  configs: new Map<string, Record<string, unknown>>(),
}));

vi.mock('../auth', () => ({
  actionAdminRequired: vi.fn(),
  actionUserRequired: () => userMock(),
}));
vi.mock('../../server/blaulichtsms/encryption', () => ({
  encryptPassword: async (v: string) => `enc:${v}`,
}));
vi.mock('../../server/firebase/admin', () => ({
  firestore: {
    collection: () => ({
      get: async () => ({
        docs: [...configs].map(([id, data]) => ({ id, data: () => data })),
      }),
    }),
  },
}));

import { getGroupsWithOebfvConfig } from './configActions';

beforeEach(() => {
  vi.clearAllMocks();
  configs.clear();
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
