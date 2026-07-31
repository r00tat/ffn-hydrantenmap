import { describe, it, expect, vi, beforeEach } from 'vitest';

const { userRequiredMock, createAppCheckTokenMock } = vi.hoisted(() => ({
  userRequiredMock: vi.fn(),
  createAppCheckTokenMock: vi.fn(),
}));

vi.mock('../../../server/auth/userRequired', () => ({
  default: userRequiredMock,
}));

vi.mock('../../../server/firebase/appCheck', () => ({
  createAppCheckToken: createAppCheckTokenMock,
}));

import { POST } from './route';
import { ApiException } from '../errors';

function makeReq() {
  return { headers: new Headers({ authorization: 'Bearer id-token' }) } as any;
}

describe('POST /api/appcheck', () => {
  beforeEach(() => {
    userRequiredMock.mockReset().mockResolvedValue({ sub: 'user-1' });
    createAppCheckTokenMock.mockReset().mockResolvedValue({
      token: 'minted-app-check-token',
      expireTimeMillis: 1785000000000,
    });
  });

  it('returns the minted token for an authorized user', async () => {
    const res = await POST(makeReq());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      token: 'minted-app-check-token',
      expireTimeMillis: 1785000000000,
    });
  });

  it('requires an authorized user before minting', async () => {
    await POST(makeReq());

    expect(userRequiredMock).toHaveBeenCalledTimes(1);
    expect(createAppCheckTokenMock).toHaveBeenCalledTimes(1);
  });

  it('does not mint a token when the user is not authorized', async () => {
    userRequiredMock.mockRejectedValue(
      new ApiException('your user is not authorized', { status: 403 })
    );

    const res = await POST(makeReq());

    expect(res.status).toBe(403);
    expect(createAppCheckTokenMock).not.toHaveBeenCalled();
  });

  it('answers 401 when no token was sent', async () => {
    userRequiredMock.mockRejectedValue(
      new ApiException('Unauthorized', { status: 401 })
    );

    const res = await POST(makeReq());

    expect(res.status).toBe(401);
  });

  it('reports a failed mint as 500 without leaking the token', async () => {
    createAppCheckTokenMock.mockRejectedValue(new Error('admin sdk exploded'));

    const res = await POST(makeReq());

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'admin sdk exploded' });
  });
});
