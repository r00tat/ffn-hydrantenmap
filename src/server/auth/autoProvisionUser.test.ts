import { beforeEach, describe, expect, it, vi } from 'vitest';

const { userGetMock, userSetMock, recomputeMock, writeUserRolesMock, claimsMock } =
  vi.hoisted(() => ({
    userGetMock: vi.fn(),
    userSetMock: vi.fn(),
    recomputeMock: vi.fn(),
    writeUserRolesMock: vi.fn(),
    claimsMock: vi.fn(),
  }));

vi.mock('server-only', () => ({}));
vi.mock('../firebase/admin', () => ({
  firestore: {
    collection: () => ({ doc: () => ({ get: userGetMock, set: userSetMock }) }),
  },
  firebaseAuth: { setCustomUserClaims: claimsMock },
}));
vi.mock('./userRoles', () => ({
  recomputeUserPermissions: (uid: string) => recomputeMock(uid),
  writeUserRoles: (uid: string, change: unknown) =>
    writeUserRolesMock(uid, change),
}));

import { ROLES_CATALOG_VERSION } from '../../common/permissions';
import { getUserSessionData } from './autoProvisionUser';
import { UserSessionCache, userSessionCache } from './userSessionCache';

describe('UserSessionCache', () => {
  let cache: UserSessionCache;

  beforeEach(() => {
    cache = new UserSessionCache(1000);
  });

  it('returns undefined for unknown keys', () => {
    expect(cache.get('unknown')).toBeUndefined();
  });

  it('caches and returns data', () => {
    const data = { isAuthorized: true, isAdmin: false, groups: ['a'], groupRoles: { a: [] } };
    cache.set('uid1', data);
    expect(cache.get('uid1')).toEqual(data);
  });

  it('returns undefined after TTL expires', async () => {
    const data = { isAuthorized: true, isAdmin: false, groups: ['a'], groupRoles: { a: [] } };
    cache = new UserSessionCache(50);
    cache.set('uid1', data);
    await new Promise((r) => setTimeout(r, 60));
    expect(cache.get('uid1')).toBeUndefined();
  });

  it('invalidate removes entry', () => {
    const data = { isAuthorized: true, isAdmin: false, groups: ['a'], groupRoles: { a: [] } };
    cache.set('uid1', data);
    cache.invalidate('uid1');
    expect(cache.get('uid1')).toBeUndefined();
  });

  it('tracks known users independently of cache TTL', async () => {
    cache = new UserSessionCache(50);
    cache.markKnownUser('uid1');
    await new Promise((r) => setTimeout(r, 60));
    expect(cache.isKnownUser('uid1')).toBe(true);
  });

  it('set also marks user as known', () => {
    const data = { isAuthorized: true, isAdmin: false, groups: ['a'], groupRoles: { a: [] } };
    cache.set('uid1', data);
    expect(cache.isKnownUser('uid1')).toBe(true);
  });
});
describe('getUserSessionData', () => {
  beforeEach(() => {
    userSessionCache.invalidate('u1');
    userGetMock.mockReset();
    recomputeMock.mockReset().mockResolvedValue(true);
  });

  function userDoc(data: Record<string, unknown>) {
    userGetMock.mockResolvedValue({ exists: true, data: () => data });
  }

  it('liest groupRoles und leitet groups daraus ab', async () => {
    userDoc({
      authorized: true,
      groups: ['ffalt'],
      groupRoles: { ffnd: ['kostenersatz'], ffxy: [] },
      rolesCatalogVersion: ROLES_CATALOG_VERSION,
    });

    const result = await getUserSessionData('u1', 'x@example.com');

    expect(result?.groupRoles).toEqual({ ffnd: ['kostenersatz'], ffxy: [] });
    expect([...(result?.groups ?? [])].sort()).toEqual(['allUsers', 'ffnd', 'ffxy']);
    expect(result).not.toHaveProperty('groupAdmin');
    expect(recomputeMock).not.toHaveBeenCalled();
  });

  it('fällt ohne groupRoles nicht auf die alten Felder zurück', async () => {
    userDoc({
      authorized: true,
      groups: ['ffnd', 'kostenersatz'],
      groupAdmin: ['ffnd'],
    });

    const result = await getUserSessionData('u1', 'x@example.com');

    expect(result?.groupRoles).toEqual({});
    expect(result?.groups).toEqual(['allUsers']);
    expect(recomputeMock).not.toHaveBeenCalled();
  });

  it('stößt bei veralteter Katalogversion die Neuableitung an', async () => {
    userDoc({ authorized: true, groupRoles: { ffnd: [] }, rolesCatalogVersion: 0 });
    await getUserSessionData('u1', 'x@example.com');
    expect(recomputeMock).toHaveBeenCalledWith('u1');
  });

  it('liefert die Sitzung auch, wenn die Neuableitung scheitert', async () => {
    recomputeMock.mockRejectedValue(new Error('boom'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    userDoc({ authorized: true, groupRoles: { ffnd: [] } });

    const result = await getUserSessionData('u1', 'x@example.com');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result?.groups).toEqual(['allUsers', 'ffnd']);
    errorSpy.mockRestore();
  });
});

describe('autoProvisionInternalUser', () => {
  beforeEach(() => {
    userSessionCache.invalidate('neu');
    vi.clearAllMocks();
    userGetMock.mockResolvedValue({ exists: false });
    writeUserRolesMock.mockResolvedValue({ ffnd: [] });
  });

  it('legt interne Benutzer als Mitglied von ffnd über den Rollen-Schreibweg an', async () => {
    const result = await getUserSessionData('neu', 'neu@ff-neusiedlamsee.at', 'Neu');

    // Erst das Dokument, dann die Rollen: `writeUserRoles` verlangt ein
    // bestehendes Dokument und schreibt die abgeleiteten Rechte mit, die die
    // Firestore-Regeln lesen.
    expect(userSetMock).toHaveBeenCalledBefore(writeUserRolesMock);
    expect(writeUserRolesMock).toHaveBeenCalledWith('neu', {
      kind: 'replaceAll',
      groupRoles: { ffnd: [] },
    });
    expect(userSetMock.mock.calls[0][0]).not.toHaveProperty('groupRoles');
    expect(claimsMock).toHaveBeenCalledWith(
      'neu',
      expect.objectContaining({ groups: ['allUsers', 'ffnd'], authorized: true }),
    );
    expect(result).toMatchObject({
      isAuthorized: true,
      groups: ['allUsers', 'ffnd'],
      groupRoles: { ffnd: [] },
    });
  });
});
