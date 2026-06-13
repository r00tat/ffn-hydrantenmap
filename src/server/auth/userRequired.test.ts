import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const { verifyIdToken, docGet, setUserDoc } = vi.hoisted(() => {
  const verifyIdToken = vi.fn();
  let userDoc: { exists: boolean; data: () => unknown } = {
    exists: false,
    data: () => undefined,
  };
  const docGet = vi.fn(async () => userDoc);
  return {
    verifyIdToken,
    docGet,
    setUserDoc: (doc: { exists: boolean; data: () => unknown }) => {
      userDoc = doc;
    },
  };
});

vi.mock('../firebase/admin', () => ({
  firebaseAuth: { verifyIdToken },
  firestore: {
    collection: () => ({ doc: () => ({ get: docGet }) }),
  },
}));

import userRequired from './userRequired';

function reqWith(authHeader?: string): NextRequest {
  return {
    headers: { get: (_: string) => authHeader ?? null },
  } as unknown as NextRequest;
}

describe('userRequired', () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
    docGet.mockClear();
    setUserDoc({ exists: false, data: () => undefined });
  });

  it('verifies the token with checkRevoked enabled', async () => {
    verifyIdToken.mockResolvedValue({
      sub: 'u1',
      email: 'ext@example.com',
    });
    setUserDoc({ exists: true, data: () => ({ authorized: true }) });
    await userRequired(reqWith('Bearer tok'));
    expect(verifyIdToken).toHaveBeenCalledWith('tok', true);
  });

  it('rejects a de-authorized internal user that has a Firestore doc', async () => {
    verifyIdToken.mockResolvedValue({
      sub: 'u1',
      email: 'someone@ff-neusiedlamsee.at',
    });
    setUserDoc({ exists: true, data: () => ({ authorized: false }) });
    await expect(userRequired(reqWith('Bearer tok'))).rejects.toBeTruthy();
  });

  it('allows an internal user without a doc yet (first login / provisioning)', async () => {
    verifyIdToken.mockResolvedValue({
      sub: 'u1',
      email: 'someone@ffnd.at',
    });
    setUserDoc({ exists: false, data: () => undefined });
    await expect(userRequired(reqWith('Bearer tok'))).resolves.toMatchObject({
      sub: 'u1',
    });
  });

  it('rejects an external user without a doc', async () => {
    verifyIdToken.mockResolvedValue({ sub: 'u1', email: 'ext@example.com' });
    setUserDoc({ exists: false, data: () => undefined });
    await expect(userRequired(reqWith('Bearer tok'))).rejects.toBeTruthy();
  });

  it('rejects when no authorization header is present', async () => {
    await expect(userRequired(reqWith(undefined))).rejects.toBeTruthy();
    expect(verifyIdToken).not.toHaveBeenCalled();
  });
});
