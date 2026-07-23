import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const { tokenRequiredMock, userGetMock } = vi.hoisted(() => ({
  tokenRequiredMock: vi.fn(),
  userGetMock: vi.fn(),
}));

vi.mock('./tokenRequired', () => ({ default: tokenRequiredMock }));
vi.mock('../firebase/admin', () => ({
  firestore: {
    collection: () => ({ doc: () => ({ get: userGetMock }) }),
  },
}));

import { authorizeTokenForGroup } from './authorizeTokenForGroup';
import { ApiException } from '../../app/api/errors';

const req = {} as any;
const userDoc = (data: Record<string, unknown> | undefined) => ({
  data: () => data,
});

describe('authorizeTokenForGroup', () => {
  beforeEach(() => {
    tokenRequiredMock.mockReset();
    userGetMock.mockReset();
  });

  it('propagates the ApiException from tokenRequired (invalid token)', async () => {
    tokenRequiredMock.mockRejectedValue(
      new ApiException('token invalid', { status: 403 }),
    );
    await expect(authorizeTokenForGroup(req, 'ffnd')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('throws 403 when the owner is not a member of the group', async () => {
    tokenRequiredMock.mockResolvedValue({ owner: 'u1' });
    userGetMock.mockResolvedValue(userDoc({ groups: ['other'], isAdmin: false }));
    await expect(authorizeTokenForGroup(req, 'ffnd')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('resolves for a group member', async () => {
    tokenRequiredMock.mockResolvedValue({ owner: 'u1' });
    userGetMock.mockResolvedValue(userDoc({ groups: ['ffnd'], isAdmin: false }));
    const result = await authorizeTokenForGroup(req, 'ffnd');
    expect(result).toEqual({ owner: 'u1', isAdmin: false, groups: ['ffnd'] });
  });

  it('resolves for an admin regardless of membership', async () => {
    tokenRequiredMock.mockResolvedValue({ owner: 'admin' });
    userGetMock.mockResolvedValue(userDoc({ groups: [], isAdmin: true }));
    const result = await authorizeTokenForGroup(req, 'ffnd');
    expect(result.isAdmin).toBe(true);
  });

  it('throws 403 when the token has no owner', async () => {
    tokenRequiredMock.mockResolvedValue({});
    await expect(authorizeTokenForGroup(req, 'ffnd')).rejects.toMatchObject({
      status: 403,
    });
  });
});
