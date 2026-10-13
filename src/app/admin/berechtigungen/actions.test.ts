import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLES_CATALOG_VERSION } from '../../../common/permissions';

vi.mock('server-only', () => ({}));

const userDocs: { id: string; data: Record<string, unknown> }[] = [];
const logSet = vi.fn().mockResolvedValue(undefined);
const userUpdate = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../server/firebase/admin', () => ({
  firestore: {
    collection: (name: string) => {
      if (name === 'appConfig') {
        return {
          doc: () => ({
            get: async () => ({ exists: false, data: () => undefined }),
            set: logSet,
          }),
        };
      }
      return {
        get: async () => ({
          docs: userDocs.map((d) => ({ id: d.id, data: () => d.data })),
        }),
        doc: (uid: string) => ({ update: (data: unknown) => userUpdate(uid, data) }),
      };
    },
  },
  firebaseAuth: {
    listUsers: async () => ({
      users: userDocs
        .filter((d) => d.id !== 'noauth')
        .map((d) => ({ uid: d.id, email: `${d.id}@example.com` })),
      pageToken: undefined,
    }),
  },
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: () => 'DELETE_FIELD' },
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));

const writeUserRoles = vi.fn().mockResolvedValue({});
const recomputeUserPermissions = vi.fn().mockResolvedValue(false);
vi.mock('../../../server/auth/userRoles', () => ({
  writeUserRoles: (...args: unknown[]) => writeUserRoles(...args),
  recomputeUserPermissions: (...args: unknown[]) =>
    recomputeUserPermissions(...args),
}));

const invalidate = vi.fn();
vi.mock('../../../server/auth/userSessionCache', () => ({
  userSessionCache: { invalidate: (uid: string) => invalidate(uid) },
}));

const setCustomClaimsForUser = vi.fn().mockResolvedValue({});
vi.mock('../../api/users/[uid]/updateUser', () => ({
  setCustomClaimsForUser: (...args: unknown[]) => setCustomClaimsForUser(...args),
}));

const actionAdminRequired = vi.fn();
vi.mock('../../auth', () => ({
  actionAdminRequired: () => actionAdminRequired(),
}));

import {
  getPermissionsMigrationState,
  migrateUserRoles,
  recomputeAllPermissions,
  removeLegacyRoleFields,
} from './actions';

beforeEach(() => {
  vi.clearAllMocks();
  userDocs.length = 0;
  actionAdminRequired.mockResolvedValue({
    user: { id: 'admin', email: 'admin@example.com', isAdmin: true },
  });
});

describe('Admin-Schranke', () => {
  it('jede Action prüft actionAdminRequired', async () => {
    actionAdminRequired.mockRejectedValue(new Error('adminRequired'));
    await expect(getPermissionsMigrationState()).rejects.toThrow('adminRequired');
    await expect(migrateUserRoles({})).rejects.toThrow('adminRequired');
    await expect(removeLegacyRoleFields()).rejects.toThrow('adminRequired');
    await expect(recomputeAllPermissions()).rejects.toThrow('adminRequired');
    expect(writeUserRoles).not.toHaveBeenCalled();
  });
});

describe('migrateUserRoles', () => {
  it('migriert nur offene Benutzer und übernimmt die Häkchen', async () => {
    userDocs.push(
      {
        id: 'a',
        data: { groups: ['ffnd', 'ffwien', 'kostenersatz'], groupAdmin: ['ffnd'] },
      },
      { id: 'b', data: { groups: ['ffnd'], groupRoles: { ffnd: [] } } },
      { id: 'c', data: { groups: ['ffnd', 'kostenersatz'] } },
    );

    const result = await migrateUserRoles({ a: ['ffwien'] });

    expect(writeUserRoles).toHaveBeenCalledTimes(2);
    expect(writeUserRoles).toHaveBeenCalledWith('a', {
      kind: 'replaceAll',
      groupRoles: { ffnd: ['gruppenadmin'], ffwien: ['kostenersatz'] },
    });
    // Ohne Auswahl: Vorbelegung, also alle Mitgliedsgruppen.
    expect(writeUserRoles).toHaveBeenCalledWith('c', {
      kind: 'replaceAll',
      groupRoles: { ffnd: ['kostenersatz'] },
    });
    expect(result).toMatchObject({
      by: 'admin@example.com',
      processed: 2,
      skipped: 1,
      errors: [],
    });
    expect(logSet).toHaveBeenCalledWith(
      { migrate: result },
      { merge: true },
    );
    // Alte Felder und Claims bleiben: kein direkter Schreibzugriff.
    expect(userUpdate).not.toHaveBeenCalled();
    expect(setCustomClaimsForUser).not.toHaveBeenCalled();
  });

  it('protokolliert Fehler je Benutzer und macht weiter', async () => {
    userDocs.push(
      { id: 'a', data: { groups: ['ffnd'] } },
      { id: 'b', data: { groups: ['ffnd'] } },
    );
    writeUserRoles.mockRejectedValueOnce(new Error('kaputt'));

    const result = await migrateUserRoles();

    expect(result.processed).toBe(1);
    expect(result.errors).toEqual([{ uid: 'a', message: 'kaputt' }]);
  });
});

describe('removeLegacyRoleFields', () => {
  it('verweigert, solange nicht alle migriert sind', async () => {
    userDocs.push(
      { id: 'a', data: { groups: ['ffnd'], groupRoles: { ffnd: [] } } },
      { id: 'b', data: { groups: ['ffnd'] } },
    );
    await expect(removeLegacyRoleFields()).rejects.toThrow('cleanupNotAllowed');
    expect(userUpdate).not.toHaveBeenCalled();
    expect(setCustomClaimsForUser).not.toHaveBeenCalled();
  });

  it('löscht alte Felder und setzt Claims aus groupRoles', async () => {
    userDocs.push(
      {
        id: 'a',
        data: {
          groups: ['ffnd', 'kostenersatz', 'allUsers'],
          groupAdmin: ['ffnd'],
          groupRoles: { ffnd: ['gruppenadmin', 'kostenersatz'] },
          authorized: true,
        },
      },
      {
        id: 'noauth',
        data: { groups: ['ffnd'], groupRoles: { ffnd: [] } },
      },
    );

    const result = await removeLegacyRoleFields();

    expect(userUpdate).toHaveBeenCalledTimes(1);
    expect(userUpdate).toHaveBeenCalledWith('a', {
      groupAdmin: 'DELETE_FIELD',
      groups: ['ffnd', 'allUsers'],
    });
    expect(setCustomClaimsForUser).toHaveBeenCalledTimes(1);
    expect(setCustomClaimsForUser).toHaveBeenCalledWith('a', {
      groups: ['ffnd'],
      isAdmin: false,
      authorized: true,
    });
    expect(invalidate).toHaveBeenCalledWith('a');
    expect(result).toMatchObject({ processed: 1, skipped: 1, errors: [] });
    expect(logSet).toHaveBeenCalledWith({ cleanup: result }, { merge: true });
  });
});

describe('recomputeAllPermissions', () => {
  it('gleicht ab, leitet neu ab und zählt nicht migrierte', async () => {
    userDocs.push(
      {
        id: 'ok',
        data: {
          groupRoles: { ffnd: ['kostenersatz'] },
          groupPerms: { ffnd: ['kostenersatz.use'] },
          permsAny: ['kostenersatz.use'],
          rolesCatalogVersion: ROLES_CATALOG_VERSION,
        },
      },
      {
        id: 'alt',
        data: {
          groupRoles: { ffnd: ['kostenersatz'] },
          groupPerms: {},
          permsAny: [],
        },
      },
      { id: 'offen', data: { groups: ['ffnd'] } },
    );
    recomputeUserPermissions.mockImplementation(async (uid: string) => uid === 'alt');

    const result = await recomputeAllPermissions();

    expect(recomputeUserPermissions).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      processed: 1,
      skipped: 1,
      notMigrated: 1,
      deviations: [
        {
          uid: 'alt',
          label: 'alt@example.com',
          deviations: ['catalogVersion', 'groupPerms', 'permsAny'],
        },
      ],
    });
    expect(logSet).toHaveBeenCalledWith({ recompute: result }, { merge: true });
  });
});
