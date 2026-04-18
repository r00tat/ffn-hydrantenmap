import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  ensureFreshAuth: vi.fn(),
}));

vi.mock('./ensureFreshAuth', () => ({
  ensureFreshAuth: hoisted.ensureFreshAuth,
  isAuthError: (err: unknown) => {
    const code = (err as { code?: string } | null)?.code;
    return (
      code === 'permission-denied' ||
      code === 'unauthenticated' ||
      (typeof code === 'string' && code.startsWith('auth/'))
    );
  },
}));

import { withFreshAuth } from './withFreshAuth';

describe('withFreshAuth', () => {
  beforeEach(() => {
    hoisted.ensureFreshAuth.mockReset();
    hoisted.ensureFreshAuth.mockResolvedValue(true);
  });

  it('runs the operation after a pre-refresh and returns its result', async () => {
    const op = vi.fn().mockResolvedValue('ok');
    const result = await withFreshAuth(op);
    expect(result).toBe('ok');
    expect(hoisted.ensureFreshAuth).toHaveBeenCalledTimes(1);
    expect(hoisted.ensureFreshAuth).toHaveBeenLastCalledWith();
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('retries once after forced refresh on auth errors', async () => {
    const op = vi
      .fn()
      .mockRejectedValueOnce({ code: 'permission-denied' })
      .mockResolvedValueOnce('ok');

    const result = await withFreshAuth(op);

    expect(result).toBe('ok');
    expect(op).toHaveBeenCalledTimes(2);
    expect(hoisted.ensureFreshAuth).toHaveBeenCalledTimes(2);
    expect(hoisted.ensureFreshAuth).toHaveBeenLastCalledWith(true);
  });

  it('does not retry non-auth errors', async () => {
    const networkErr = { code: 'unavailable' };
    const op = vi.fn().mockRejectedValue(networkErr);

    await expect(withFreshAuth(op)).rejects.toBe(networkErr);
    expect(op).toHaveBeenCalledTimes(1);
    expect(hoisted.ensureFreshAuth).toHaveBeenCalledTimes(1);
  });

  it('throws original auth error when forced refresh fails', async () => {
    const authErr = { code: 'unauthenticated' };
    const op = vi.fn().mockRejectedValue(authErr);
    hoisted.ensureFreshAuth
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(withFreshAuth(op)).rejects.toBe(authErr);
    expect(op).toHaveBeenCalledTimes(1);
  });
});
