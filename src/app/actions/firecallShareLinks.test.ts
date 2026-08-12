import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  createJwtMock,
  createUserMock,
  updateUserMock,
  getUsersMock,
  setCustomUserClaimsMock,
  userDocGetMock,
  userDocSetMock,
  whereGetMock,
  authorizedForFirecallMock,
  getBaseUrlMock,
  invalidateMock,
} = vi.hoisted(() => ({
  createJwtMock: vi.fn(
    async (
      _payload: Record<string, unknown>,
      _subject: string,
      _expiresIn: string | number
    ) => 'signed-jwt'
  ),
  createUserMock: vi.fn(async (_data: Record<string, unknown>) => ({
    uid: 'guest-uid',
  })),
  updateUserMock: vi.fn(
    async (_uid: string, _data: Record<string, unknown>) => undefined
  ),
  getUsersMock: vi.fn(async (_ids: { uid: string }[]) => ({
    users: [] as { uid: string; metadata?: { lastSignInTime?: string } }[],
    notFound: [] as { uid: string }[],
  })),
  setCustomUserClaimsMock: vi.fn(
    async (_uid: string, _claims: Record<string, unknown>) => undefined
  ),
  userDocGetMock: vi.fn(),
  userDocSetMock: vi.fn(
    async (_data: Record<string, unknown>, _options?: unknown) => undefined
  ),
  whereGetMock: vi.fn(async () => ({
    docs: [] as { id: string; data: () => Record<string, unknown> }[],
  })),
  authorizedForFirecallMock: vi.fn(),
  getBaseUrlMock: vi.fn(async () => 'https://karte.example.at'),
  invalidateMock: vi.fn(),
}));

vi.mock('./jwt', () => ({ createJwt: createJwtMock }));

vi.mock('../auth', () => ({
  actionUserAuthorizedForFirecall: authorizedForFirecallMock,
  actionUserRequired: vi.fn(async () => ({
    user: { id: 'member-uid', name: 'Paul' },
  })),
}));

vi.mock('../../server/auth/baseUrl', () => ({ getBaseUrl: getBaseUrlMock }));

vi.mock('../../server/auth/userSessionCache', () => ({
  userSessionCache: { invalidate: invalidateMock },
}));

vi.mock('../../server/firebase/admin', () => ({
  firebaseAuth: {
    createUser: createUserMock,
    updateUser: updateUserMock,
    getUsers: getUsersMock,
    setCustomUserClaims: setCustomUserClaimsMock,
  },
  firestore: {
    collection: () => ({
      doc: () => ({ get: userDocGetMock, set: userDocSetMock }),
      where: () => ({ get: whereGetMock }),
    }),
  },
}));

const {
  createFirecallShareLink,
  issueFirecallShareLinkUrl,
  listFirecallShareLinks,
  updateFirecallShareLink,
} = await import('./firecallShareLinks');

const NOW = Date.UTC(2026, 7, 12, 12, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;
const YEAR_MS = 365 * DAY_MS;

const activeGuest = {
  displayName: 'ORF (Einsatz-Gast Brand Hauptstraße)',
  email: 'firecall+fc1-abcd@ff-neusiedlamsee.at',
  authorized: true,
  groups: ['allUsers'],
  firecall: 'fc1',
  firecallWrite: false,
  firecallExpiresAt: NOW + 60_000,
  firecallCreatedAt: NOW - 60_000,
  firecallCreatedBy: 'member-uid',
  firecallCreatedByName: 'Paul',
};

function guestDoc(data: Record<string, unknown>) {
  return { exists: true, id: 'guest-uid', data: () => data };
}

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.clearAllMocks();
  createJwtMock.mockResolvedValue('signed-jwt');
  createUserMock.mockResolvedValue({ uid: 'guest-uid' });
  getBaseUrlMock.mockResolvedValue('https://karte.example.at');
  authorizedForFirecallMock.mockResolvedValue({
    id: 'fc1',
    name: 'Brand Hauptstraße',
    group: 'ffnd',
  });
  userDocGetMock.mockResolvedValue(guestDoc(activeGuest));
});

describe('createFirecallShareLink', () => {
  it('requires group membership, not just write access', async () => {
    await createFirecallShareLink('fc1', {
      name: 'ORF',
      canWrite: false,
      expiresAt: NOW + 1000,
    });

    expect(authorizedForFirecallMock).toHaveBeenCalledWith('fc1', {
      requireWrite: true,
      requireGroupMember: true,
    });
  });

  it('stores expiry, creator and creation time', async () => {
    await createFirecallShareLink('fc1', {
      name: 'ORF',
      canWrite: false,
      expiresAt: NOW + 7 * DAY_MS,
    });

    expect(userDocSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'ORF (Einsatz-Gast Brand Hauptstraße)',
        firecallExpiresAt: NOW + 7 * DAY_MS,
        firecallCreatedAt: NOW,
        firecallCreatedBy: 'member-uid',
        firecallCreatedByName: 'Paul',
      })
    );
  });

  it('caps the expiry at one year', async () => {
    await createFirecallShareLink('fc1', {
      name: 'ORF',
      canWrite: false,
      expiresAt: NOW + 5 * YEAR_MS,
    });

    expect(userDocSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ firecallExpiresAt: NOW + YEAR_MS })
    );
  });

  it('rejects an expiry in the past', async () => {
    await expect(
      createFirecallShareLink('fc1', {
        name: 'ORF',
        canWrite: false,
        expiresAt: NOW - 1,
      })
    ).rejects.toThrow(/future/);
  });

  it('signs the jwt with the link expiry, not a fixed week', async () => {
    await createFirecallShareLink('fc1', {
      name: 'ORF',
      canWrite: false,
      expiresAt: NOW + 3 * DAY_MS,
    });

    expect(createJwtMock).toHaveBeenCalledWith(
      expect.anything(),
      'guest-uid',
      Math.floor((NOW + 3 * DAY_MS) / 1000)
    );
  });

  it('builds the url on the server so links work from the app', async () => {
    const result = await createFirecallShareLink('fc1', {
      name: 'ORF',
      canWrite: false,
      expiresAt: NOW + 1000,
    });

    expect(result.link).toBe(
      'https://karte.example.at/einsatz/fc1?token=signed-jwt'
    );
  });

  it('passes the expiry into the custom claims', async () => {
    await createFirecallShareLink('fc1', {
      name: 'ORF',
      canWrite: false,
      expiresAt: NOW + 1000,
    });

    expect(setCustomUserClaimsMock).toHaveBeenCalledWith(
      'guest-uid',
      expect.objectContaining({ firecallExpires: NOW + 1000 })
    );
  });
});

describe('listFirecallShareLinks', () => {
  it('returns the guests of the firecall with their last sign-in', async () => {
    whereGetMock.mockResolvedValue({ docs: [guestDoc(activeGuest)] });
    getUsersMock.mockResolvedValue({
      users: [
        {
          uid: 'guest-uid',
          metadata: { lastSignInTime: new Date(NOW - 5000).toUTCString() },
        },
      ],
      notFound: [],
    });

    const links = await listFirecallShareLinks('fc1');

    expect(links).toEqual([
      expect.objectContaining({
        uid: 'guest-uid',
        name: 'ORF',
        canWrite: false,
        disabled: false,
        expiresAt: activeGuest.firecallExpiresAt,
        createdByName: 'Paul',
        lastSignInAt: NOW - 5000,
      }),
    ]);
  });

  it('keeps guests whose auth record is gone', async () => {
    whereGetMock.mockResolvedValue({ docs: [guestDoc(activeGuest)] });
    getUsersMock.mockResolvedValue({
      users: [],
      notFound: [{ uid: 'guest-uid' }],
    });

    const links = await listFirecallShareLinks('fc1');

    expect(links).toHaveLength(1);
    expect(links[0].lastSignInAt).toBeUndefined();
  });

  it('does not call firebase auth for an empty firecall', async () => {
    whereGetMock.mockResolvedValue({ docs: [] });

    expect(await listFirecallShareLinks('fc1')).toEqual([]);
    expect(getUsersMock).not.toHaveBeenCalled();
  });
});

describe('updateFirecallShareLink', () => {
  it('rejects a uid that belongs to another firecall', async () => {
    userDocGetMock.mockResolvedValue(
      guestDoc({ ...activeGuest, firecall: 'other-firecall' })
    );

    await expect(
      updateFirecallShareLink('fc1', 'guest-uid', { name: 'Neu' })
    ).rejects.toThrow(/not a share link/);
  });

  it('renames the guest in auth and in firestore', async () => {
    await updateFirecallShareLink('fc1', 'guest-uid', { name: '  Presse  ' });

    expect(updateUserMock).toHaveBeenCalledWith('guest-uid', {
      displayName: 'Presse (Einsatz-Gast Brand Hauptstraße)',
    });
    expect(userDocSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'Presse (Einsatz-Gast Brand Hauptstraße)',
      }),
      { merge: true }
    );
  });

  it('changes the access level', async () => {
    const link = await updateFirecallShareLink('fc1', 'guest-uid', {
      canWrite: true,
    });

    expect(link.canWrite).toBe(true);
    expect(setCustomUserClaimsMock).toHaveBeenCalledWith(
      'guest-uid',
      expect.objectContaining({ firecallWrite: true })
    );
  });

  it('invalidates the session cache so the change takes effect', async () => {
    await updateFirecallShareLink('fc1', 'guest-uid', { canWrite: true });

    expect(invalidateMock).toHaveBeenCalledWith('guest-uid');
  });

  it('refuses to reactivate an expired link without a new date', async () => {
    userDocGetMock.mockResolvedValue(
      guestDoc({
        ...activeGuest,
        authorized: false,
        firecallExpiresAt: NOW - 1,
      })
    );

    await expect(
      updateFirecallShareLink('fc1', 'guest-uid', { active: true })
    ).rejects.toThrow(/expired/);
  });

  it('reactivates an expired link together with a new date', async () => {
    userDocGetMock.mockResolvedValue(
      guestDoc({
        ...activeGuest,
        authorized: false,
        firecallExpiresAt: NOW - 1,
      })
    );

    const link = await updateFirecallShareLink('fc1', 'guest-uid', {
      active: true,
      expiresAt: NOW + DAY_MS,
    });

    expect(link.disabled).toBe(false);
    expect(link.expiresAt).toBe(NOW + DAY_MS);
  });

  it('deactivates without touching the expiry', async () => {
    await updateFirecallShareLink('fc1', 'guest-uid', { active: false });

    expect(userDocSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        authorized: false,
        firecallExpiresAt: activeGuest.firecallExpiresAt,
      }),
      { merge: true }
    );
  });

  it('caps a new expiry at one year as well', async () => {
    const link = await updateFirecallShareLink('fc1', 'guest-uid', {
      expiresAt: NOW + 5 * YEAR_MS,
    });

    expect(link.expiresAt).toBe(NOW + YEAR_MS);
  });
});

describe('issueFirecallShareLinkUrl', () => {
  it('signs a fresh jwt with the stored expiry', async () => {
    const result = await issueFirecallShareLinkUrl('fc1', 'guest-uid');

    expect(result.link).toBe(
      'https://karte.example.at/einsatz/fc1?token=signed-jwt'
    );
    expect(createJwtMock).toHaveBeenCalledWith(
      expect.anything(),
      'guest-uid',
      Math.floor(activeGuest.firecallExpiresAt / 1000)
    );
  });

  it('refuses to hand out a link for an expired guest', async () => {
    userDocGetMock.mockResolvedValue(
      guestDoc({ ...activeGuest, firecallExpiresAt: NOW - 1 })
    );

    await expect(issueFirecallShareLinkUrl('fc1', 'guest-uid')).rejects.toThrow(
      /expired/
    );
  });

  it('refuses to hand out a link for a disabled guest', async () => {
    userDocGetMock.mockResolvedValue(
      guestDoc({ ...activeGuest, authorized: false })
    );

    await expect(issueFirecallShareLinkUrl('fc1', 'guest-uid')).rejects.toThrow(
      /disabled/
    );
  });
});
