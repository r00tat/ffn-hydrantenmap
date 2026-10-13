import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserRecordExtended } from '../../../../common/users';

vi.mock('server-only', () => ({}));

const {
  setCustomUserClaimsMock,
  userDocSetMock,
  userDocGetMock,
  invalidateMock,
  setUserMembershipsMock,
} = vi.hoisted(() => ({
  setCustomUserClaimsMock: vi.fn(
    async (_uid: string, _claims: Record<string, unknown>) => undefined
  ),
  userDocSetMock: vi.fn(
    async (_data: Record<string, unknown>, _options?: unknown) => undefined
  ),
  userDocGetMock: vi.fn(),
  invalidateMock: vi.fn(),
  setUserMembershipsMock: vi.fn(),
}));

vi.mock('../../../../server/firebase/admin', () => ({
  firebaseAuth: { setCustomUserClaims: setCustomUserClaimsMock },
  firestore: {
    collection: () => ({
      doc: () => ({ set: userDocSetMock, get: userDocGetMock }),
    }),
  },
}));

vi.mock('../../../../server/auth/changeUserRoles', () => ({
  setUserMemberships: (uid: string, groupIds: string[], user: unknown) =>
    setUserMembershipsMock(uid, groupIds, user),
}));

vi.mock('../../../../server/auth/userSessionCache', () => ({
  userSessionCache: { invalidate: invalidateMock },
}));

const { updateUser } = await import('./updateUser');

const EXPIRES_AT = 1_800_000_000_000;

function guest(overrides: Partial<UserRecordExtended> = {}) {
  return {
    displayName: 'ORF (Einsatz-Gast Brand Hauptstraße)',
    email: 'firecall+fc1-abc@ff-neusiedlamsee.at',
    authorized: true,
    groups: ['allUsers'],
    firecall: 'fc1',
    firecallWrite: true,
    firecallExpiresAt: EXPIRES_AT,
    ...overrides,
  } as UserRecordExtended;
}

function storedUser(data: Record<string, unknown> | undefined) {
  userDocGetMock.mockResolvedValue({
    exists: data !== undefined,
    data: () => data,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  storedUser({ groups: ['allUsers'] });
});

describe('updateUser', () => {
  it('keeps the guest expiry when an admin edits the user', async () => {
    await updateUser('guest-uid', guest());

    expect(setCustomUserClaimsMock).toHaveBeenCalledWith(
      'guest-uid',
      expect.objectContaining({
        firecall: 'fc1',
        firecallWrite: true,
        firecallExpires: EXPIRES_AT,
      })
    );
  });

  it('persists the expiry in the user document', async () => {
    await updateUser('guest-uid', guest());

    expect(userDocSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ firecallExpiresAt: EXPIRES_AT }),
      { merge: true }
    );
  });

  it('does not add guest fields for a regular user', async () => {
    await updateUser('member-uid', {
      displayName: 'Paul',
      email: 'paul@ff-neusiedlamsee.at',
      authorized: true,
      groups: ['ffnd'],
    } as UserRecordExtended);

    const claims = setCustomUserClaimsMock.mock.calls[0][1];
    expect(claims).not.toHaveProperty('firecall');
    expect(claims).not.toHaveProperty('firecallExpires');
    expect(userDocSetMock.mock.calls[0][0]).not.toHaveProperty(
      'firecallExpiresAt'
    );
  });

  it('schreibt das alte Feld groups nicht mehr', async () => {
    await updateUser('member-uid', {
      displayName: 'Muster',
      authorized: true,
      groups: ['ffnd'],
    } as UserRecordExtended);

    expect(userDocSetMock.mock.calls[0][0]).not.toHaveProperty('groups');
    expect(setUserMembershipsMock).not.toHaveBeenCalled();
  });
});

describe('updateUser — Mitgliedschaft', () => {
  it('setzt die Gruppen über die Rollenverwaltung, wenn sie übergeben werden', async () => {
    const stored = { groupRoles: { ffnd: ['geraetemeister'] } };
    storedUser(stored);
    setUserMembershipsMock.mockResolvedValue({
      ffnd: ['geraetemeister'],
      b: [],
    });

    await updateUser(
      'member-uid',
      { authorized: true } as UserRecordExtended,
      ['ffnd', 'b'],
    );

    expect(setUserMembershipsMock).toHaveBeenCalledWith(
      'member-uid',
      ['ffnd', 'b'],
      stored,
    );
    expect(setCustomUserClaimsMock.mock.calls[0][1]).toMatchObject({
      groups: ['ffnd', 'b', 'allUsers'],
    });
  });

  it('bildet den Claim eines migrierten Benutzers aus groupRoles', async () => {
    storedUser({ groupRoles: { ffnd: [] }, groups: ['allUsers', 'veraltet'] });

    await updateUser('member-uid', {
      authorized: true,
      // Was der Client mitschickt, ist für die Gruppen nicht maßgeblich.
      groups: ['allUsers', 'veraltet'],
    } as UserRecordExtended);

    expect(setCustomUserClaimsMock.mock.calls[0][1]).toMatchObject({
      groups: ['ffnd', 'allUsers'],
    });
  });

  it('lässt den Claim eines nicht migrierten Benutzers beim Freischalten stehen', async () => {
    storedUser({ groups: ['allUsers', 'ffnd', 'kostenersatz'] });

    await updateUser('member-uid', {
      authorized: true,
    } as UserRecordExtended);

    expect(setCustomUserClaimsMock.mock.calls[0][1]).toMatchObject({
      groups: ['allUsers', 'ffnd', 'kostenersatz'],
    });
  });
});


describe('updateUser vor der Migration', () => {
  it('ändert die Gruppen eines Benutzers mit altem Kostenersatz nicht', async () => {
    // Die Umrechnung gäbe ihm Kostenersatz in jeder Gruppe, und Schritt 2
    // überspränge ihn danach samt der Auswahl je Gruppe.
    storedUser({ groups: ['allUsers', 'ffnd', 'kostenersatz'] });

    const result = await updateUser(
      'member-uid',
      { authorized: true } as UserRecordExtended,
      ['ffnd', 'ffwien'],
    );

    expect(result).toEqual({ error: 'notMigrated' });
    expect(userDocSetMock).not.toHaveBeenCalled();
    expect(setUserMembershipsMock).not.toHaveBeenCalled();
    expect(setCustomUserClaimsMock).not.toHaveBeenCalled();
  });

  it('speichert ihn, solange die Gruppen gleich bleiben', async () => {
    storedUser({ groups: ['allUsers', 'ffnd', 'kostenersatz'] });
    setUserMembershipsMock.mockResolvedValue({ ffnd: ['kostenersatz'] });

    const result = await updateUser(
      'member-uid',
      { authorized: true } as UserRecordExtended,
      ['ffnd'],
    );

    expect(result).not.toHaveProperty('error');
    expect(userDocSetMock).toHaveBeenCalled();
  });
});
