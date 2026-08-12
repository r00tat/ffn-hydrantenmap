import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserRecordExtended } from '../../../../common/users';

vi.mock('server-only', () => ({}));

const { setCustomUserClaimsMock, userDocSetMock, invalidateMock } = vi.hoisted(
  () => ({
    setCustomUserClaimsMock: vi.fn(
      async (_uid: string, _claims: Record<string, unknown>) => undefined
    ),
    userDocSetMock: vi.fn(
      async (_data: Record<string, unknown>, _options?: unknown) => undefined
    ),
    invalidateMock: vi.fn(),
  })
);

vi.mock('../../../../server/firebase/admin', () => ({
  firebaseAuth: { setCustomUserClaims: setCustomUserClaimsMock },
  firestore: {
    collection: () => ({ doc: () => ({ set: userDocSetMock }) }),
  },
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

beforeEach(() => {
  vi.clearAllMocks();
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
});
