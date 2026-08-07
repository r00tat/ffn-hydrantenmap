import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DecodedIdToken } from 'firebase-admin/auth';

vi.mock('server-only', () => ({}));

const { collectionMock, setFirecall, setFirecallMissing, setUser } = vi.hoisted(
  () => {
  let firecall: { exists: boolean; id: string; data: () => unknown } = {
    exists: false,
    id: 'fc1',
    data: () => undefined,
  };
  let user: { exists: boolean; data: () => unknown } = {
    exists: false,
    data: () => undefined,
  };

  const collectionMock = vi.fn((name: string) => ({
    doc: (id: string) => ({
      get: async () => {
        if (name === 'call') {
          return { ...firecall, id };
        }
        return user;
      },
    }),
  }));

  return {
    collectionMock,
    setFirecall: (group?: string) => {
      firecall =
        group === undefined
          ? { exists: true, id: 'fc1', data: () => ({}) }
          : { exists: true, id: 'fc1', data: () => ({ group }) };
    },
    setFirecallMissing: () => {
      firecall = { exists: false, id: 'fc1', data: () => undefined };
    },
    setUser: (
      groups: string[],
      firecallClaim?: string,
      firecallWrite?: boolean,
    ) => {
      user = {
        exists: true,
        data: () => ({
          groups,
          firecall: firecallClaim,
          ...(firecallWrite === undefined ? {} : { firecallWrite }),
        }),
      };
    },
  };
});

vi.mock('../firebase/admin', () => ({
  firestore: { collection: collectionMock },
}));

import { verifyUserAuthorizedForFirecall } from './verifyUserAuthorizedForFirecall';

const user = { uid: 'user-1' } as DecodedIdToken;

describe('verifyUserAuthorizedForFirecall', () => {
  beforeEach(() => {
    collectionMock.mockClear();
  });

  it('returns the firecall when the user is in its group', async () => {
    setFirecall('einsatz');
    setUser(['einsatz', 'allUsers']);
    const result = await verifyUserAuthorizedForFirecall(user, 'fc1');
    expect(result.group).toBe('einsatz');
    expect(result.id).toBe('fc1');
  });

  it('returns the firecall for a single-firecall guest claim', async () => {
    setFirecall('einsatz');
    setUser([], 'fc1');
    const result = await verifyUserAuthorizedForFirecall(user, 'fc1');
    expect(result.id).toBe('fc1');
  });

  it('throws 403 when the user is not in the group and has no matching firecall claim', async () => {
    setFirecall('einsatz');
    setUser(['otherGroup'], 'other-firecall');
    await expect(
      verifyUserAuthorizedForFirecall(user, 'fc1')
    ).rejects.toMatchObject({ status: 403 });
  });

  it('throws 404 when the firecall does not exist', async () => {
    setFirecallMissing();
    setUser(['einsatz']);
    await expect(
      verifyUserAuthorizedForFirecall(user, 'missing')
    ).rejects.toMatchObject({ status: 404 });
  });

  it('allows a write for a group member regardless of the guest flag', async () => {
    setFirecall('ffnd');
    setUser(['ffnd'], undefined, false);

    await expect(
      verifyUserAuthorizedForFirecall(user, 'fc1', { requireWrite: true }),
    ).resolves.toMatchObject({ group: 'ffnd' });
  });

  it('allows a write for a guest with write access', async () => {
    setFirecall('ffnd');
    setUser(['allUsers'], 'fc1', true);

    await expect(
      verifyUserAuthorizedForFirecall(user, 'fc1', { requireWrite: true }),
    ).resolves.toMatchObject({ group: 'ffnd' });
  });

  it('allows a write for a guest created before the flag existed', async () => {
    setFirecall('ffnd');
    setUser(['allUsers'], 'fc1');

    await expect(
      verifyUserAuthorizedForFirecall(user, 'fc1', { requireWrite: true }),
    ).resolves.toMatchObject({ group: 'ffnd' });
  });

  it('throws 403 when a read-only guest attempts a write', async () => {
    setFirecall('ffnd');
    setUser(['allUsers'], 'fc1', false);

    await expect(
      verifyUserAuthorizedForFirecall(user, 'fc1', { requireWrite: true }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('still allows reads for a read-only guest', async () => {
    setFirecall('ffnd');
    setUser(['allUsers'], 'fc1', false);

    await expect(
      verifyUserAuthorizedForFirecall(user, 'fc1'),
    ).resolves.toMatchObject({ group: 'ffnd' });
  });

  it('throws 403 when the firecall has no group', async () => {
    setFirecall(undefined);
    setUser(['einsatz']);
    await expect(
      verifyUserAuthorizedForFirecall(user, 'fc1')
    ).rejects.toMatchObject({ status: 403 });
  });
});
